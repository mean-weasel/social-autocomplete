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

test("preflight can pass before results exist when no query interaction has begun", async () => {
  const { output, code } = await run({
    ...base,
    resultsLandmark: false,
    interactionAttempted: false,
    interactionSucceeded: false,
  });
  assert.equal(code, 0);
  assert.equal(output.receipt.status, "pass");
  assert.deepEqual(output.receipt.checkpoints.at(-1), { id: "results", status: "missing" });
});

test("semantic diagnostics require an exact matched route and preserve only bounded labels", async () => {
  const facebookPreflight = {
    ...base,
    browser: "chrome",
    channel: "facebook",
    accessClass: "authenticated",
    targetMatched: true,
    searchLandmark: true,
    resultsLandmark: false,
    interactionAttempted: false,
    interactionSucceeded: false,
    routeClass: "facebook_search",
    expectedLandmark: "facebook_native_search_entry",
    observedLandmark: "facebook_native_search_entry",
  };
  const ready = await run(facebookPreflight);
  assert.equal(ready.code, 0);
  assert.equal(ready.output.receipt.status, "pass");
  assert.deepEqual(ready.output.receipt.diagnostic, {
    targetMatched: true,
    routeClass: "facebook_search",
    expectedLandmark: "facebook_native_search_entry",
    observedLandmark: "facebook_native_search_entry",
  });
  assert.doesNotMatch(JSON.stringify(ready.output.receipt.diagnostic), /https?:|@|body|dom|selector/i);

  const unmatched = await run({ ...facebookPreflight, targetMatched: false });
  assert.equal(unmatched.output.receipt.status, "failed");
  assert.equal(unmatched.output.receipt.reasonCode, "ui_change");

  const missingDiagnostic = await run({
    ...facebookPreflight,
    routeClass: undefined,
    expectedLandmark: undefined,
    observedLandmark: undefined,
  });
  assert.equal(missingDiagnostic.output.receipt.status, "failed");
  assert.equal(missingDiagnostic.output.receipt.reasonCode, "ui_change");

  const invalid = await run({
    ...facebookPreflight,
    routeClass: "facebook_authenticated_shell",
  });
  assert.equal(invalid.code, 2);
  assert.equal(invalid.output.ok, false);
  assert.match(invalid.output.error, /Invalid semantic diagnostic/);
});

test("results remain mandatory after a successful query interaction begins", async () => {
  const { output } = await run({
    ...base,
    resultsLandmark: false,
  });
  assert.equal(output.receipt.status, "failed");
  assert.equal(output.receipt.reasonCode, "ui_change");
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
  assert.match(readme, /exactly one[\s\S]*in-origin[\s\S]*native Search navigation\s+control/i);
  assert.match(sharedContract, /discard non-matches before returning/i);
  assert.match(sharedContract, /Never guess a URL or selector/i);
  assert.match(sharedContract, /Never repeat a preflight with a broader tab or DOM read/i);
});

test("private input fields are visibly rejected", async () => {
  const { output, code } = await run({ ...base, cookies: "secret" });
  assert.equal(code, 2);
  assert.equal(output.ok, false);
  assert.match(output.error, /Forbidden private field/);
});

test("authenticated acceptance rejects screenshot capture", async () => {
  const { output, code } = await run({
    ...base,
    browser: "chrome",
    accessClass: "authenticated",
    screenshotCaptured: true,
  });
  assert.equal(code, 2);
  assert.equal(output.ok, false);
  assert.match(output.error, /screenshots are prohibited/i);
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
