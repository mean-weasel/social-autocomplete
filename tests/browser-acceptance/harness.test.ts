import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const base = {
  host: "codex",
  browser: "in_app",
  channel: "youtube",
  module: "search-term",
  accessClass: "public",
  locale: { uiLocale: "en-US", region: "US", timezone: "America/Phoenix" },
  accessState: "ready",
  localeMatches: true,
  searchLandmark: true,
  resultsLandmark: true,
  interactionAttempted: true,
  interactionSucceeded: true,
  explicitNativeEmpty: false,
};

async function run(input: unknown): Promise<{ output: any; code: number }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/browser-acceptance/run.mjs",
      "--input",
      JSON.stringify(input),
    ]);
    return { output: JSON.parse(stdout), code: 0 };
  } catch (error) {
    const failure = error as Error & { stdout: string; code: number };
    return { output: JSON.parse(failure.stdout), code: failure.code };
  }
}

test("harness emits a bounded sanitized receipt", async () => {
  const { output, code } = await run(base);
  assert.equal(code, 0);
  assert.equal(output.receipt.status, "pass");
  assert.equal(output.receipt.checkpoints.length, 3);
  assert.equal(JSON.stringify(output).includes("rawDom"), false);
  assert.match(output.receipt.receiptId, /^acceptance_[a-f0-9]{24}$/);
});

test("private input fields are visibly rejected", async () => {
  const { output, code } = await run({ ...base, cookies: "secret" });
  assert.equal(code, 2);
  assert.equal(output.ok, false);
  assert.match(output.error, /Forbidden private field/);
});

test("Claude in-app and public fallbacks are explicit capability interruptions", async () => {
  const { output } = await run({ ...base, host: "claude", browser: "in_app" });
  assert.equal(output.receipt.status, "interrupted");
  assert.equal(output.receipt.reasonCode, "capability_unavailable");
});

test("Pinterest hashtag is not applicable without an interaction", async () => {
  const { output } = await run({
    ...base,
    channel: "pinterest",
    module: "hashtag",
    interactionAttempted: false,
    interactionSucceeded: false,
  });
  assert.equal(output.receipt.status, "not_applicable");
  assert.equal(output.receipt.reasonCode, "pinterest_hashtag_not_applicable");
});
