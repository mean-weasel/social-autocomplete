import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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

test("authenticated preflight contract prohibits broad reads and limits its projection", async () => {
  const [readme, sharedContract] = await Promise.all([
    readFile("docs/browser-acceptance/README.md", "utf8"),
    readFile("skills/_shared/browser-research-contract.md", "utf8"),
  ]);

  assert.match(readme, /filter open targets to the expected channel origin/i);
  assert.match(readme, /Never return a complete open-tab\s+list/i);
  assert.match(readme, /full authenticated DOM snapshot/i);
  assert.match(readme, /`body` text, feed content, account\s+identifiers/i);
  assert.match(readme, /structural booleans[\s\S]*sanitized status code[\s\S]*expected semantic landmark[\s\S]*observed semantic landmark/i);
  assert.match(readme, /without exposing the targets that were inspected/i);
  assert.match(sharedContract, /discard non-matches before returning/i);
  assert.match(sharedContract, /Never repeat a preflight with a broader tab or DOM read/i);
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
