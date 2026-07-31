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
const LEASE_HASH = "d".repeat(64);

function assertPostAcknowledgementAcquisitionContract(contract: string): void {
  const normalized = contract
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const bindingPhrase = /exact selected host (?:browser )?binding again/i;
  const bindingMatch = bindingPhrase.exec(normalized);

  assert.match(
    normalized,
    /availability probe(?: only)?|only (?:as )?an availability probe/i,
  );
  assert.ok(bindingMatch, "requires exact selected-host binding re-resolution");

  const bindingIndex = bindingMatch.index;
  const acknowledgementScope = normalized.slice(
    Math.max(0, bindingIndex - 400),
    bindingIndex,
  );
  const continuationScope = normalized.slice(
    Math.max(0, bindingIndex - 200),
    bindingIndex + 1400,
  );
  const acquisitionScope = normalized.slice(bindingIndex, bindingIndex + 1400);
  const tabsNewIndex = acquisitionScope.search(/tabs\.new/i);

  assert.match(acknowledgementScope, /acknowledg|ACK\/hash/i);
  assert.match(normalized, /lease(?:-| )hash|targetLeaseHash/i);
  assert.match(
    continuationScope,
    /same (?:post-acknowledgement )?(?:worker )?continuation/i,
  );
  assert.match(
    acquisitionScope,
    /(?:emit |with )?no[^.]{0,220}(?:intermediate |other )worker output|without[^.]{0,220}(?:intermediate |other )worker output/i,
  );
  assert.match(
    acquisitionScope,
    /immediate(?:ly)?[^.]{0,80}tabs\.new|tabs\.new[^.]{0,80}immediate(?:ly)?/i,
  );
  assert.ok(tabsNewIndex > 0, "requires tabs.new after binding re-resolution");
  assert.match(acquisitionScope, /started/i);
  assert.match(acquisitionScope, /ambiguous_browser_action/i);
  assert.match(
    acquisitionScope,
    /non-replayable|never retr(?:y|ied)|cannot be retried|do not retry|without retry/i,
  );
}

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

test("harness emits only a sanitized released dedicated-target lease for normal completion", async () => {
  const released = await run({
    ...base,
    targetLease: {
      ownership: "plugin_owned",
      lifecycle: "released",
      leaseHash: LEASE_HASH,
    },
  });
  assert.equal(released.code, 0);
  assert.deepEqual(released.output.receipt.dedicatedTarget, {
    ownership: "plugin_owned",
    lifecycle: "released",
    leaseHash: LEASE_HASH,
  });
  const live = await run({
    ...base,
    targetLease: {
      ownership: "plugin_owned",
      lifecycle: "created",
      leaseHash: LEASE_HASH,
    },
  });
  assert.equal(live.output.receipt.status, "failed");
  assert.equal(live.output.receipt.reasonCode, "ui_change");
  assert.doesNotMatch(JSON.stringify(released.output), /rawHandle|targetId|tabId|https?:\/\//i);
});

test("manual authentication handoff is the only unreleased-target receipt", async () => {
  const handoff = await run({
    ...base,
    browser: "chrome",
    accessClass: "authenticated",
    accessState: "authentication_required",
    searchLandmark: false,
    resultsLandmark: false,
    interactionAttempted: false,
    interactionSucceeded: false,
    targetLease: {
      ownership: "plugin_owned",
      lifecycle: "authentication_handoff",
      leaseHash: LEASE_HASH,
    },
  });
  assert.equal(handoff.output.receipt.status, "interrupted");
  assert.equal(handoff.output.receipt.reasonCode, "authentication_required");
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
  assert.equal(unmatched.code, 2);
  assert.equal(unmatched.output.ok, false);
  assert.match(unmatched.output.error, /Invalid semantic diagnostic/);

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

test("receipt creation rejects inconsistent target-match diagnostics", async () => {
  const cases = [
    ["facebook", "facebook_search", "facebook_native_search_entry", "facebook_native_search_entry"],
    ["instagram", "instagram_search", "instagram_native_search_entry", "instagram_native_search_entry"],
    ["linkedin", "linkedin_search", "linkedin_native_search_entry", "linkedin_native_search_entry"],
  ] as const;
  for (const [channel, routeClass, expectedLandmark, observedLandmark] of cases) {
    const unmatchedRoute = await run({
      ...base,
      browser: "chrome",
      channel,
      accessClass: "authenticated",
      targetMatched: false,
      routeClass,
      expectedLandmark,
      observedLandmark,
    });
    assert.equal(unmatchedRoute.code, 2, channel);
    assert.match(unmatchedRoute.output.error, /Invalid semantic diagnostic/);

    const matchedUnavailable = await run({
      ...base,
      browser: "chrome",
      channel,
      accessClass: "authenticated",
      targetMatched: true,
      routeClass: `${channel}_target_unavailable`,
      expectedLandmark,
      observedLandmark: "target_unavailable",
    });
    assert.equal(matchedUnavailable.code, 2, channel);
    assert.match(matchedUnavailable.output.error, /Invalid semantic diagnostic/);
  }
});

test("matched authenticated shell and feed diagnostics remain valid ui_change receipts", async () => {
  const cases = [
    ["facebook", "facebook_authenticated_shell", "facebook_native_search_entry", "facebook_authenticated_navigation"],
    ["instagram", "instagram_authenticated_shell", "instagram_native_search_entry", "instagram_authenticated_navigation"],
    ["linkedin", "linkedin_authenticated_feed", "linkedin_native_search_entry", "linkedin_authenticated_feed_navigation"],
  ] as const;
  for (const [channel, routeClass, expectedLandmark, observedLandmark] of cases) {
    const outcome = await run({
      ...base,
      browser: "chrome",
      channel,
      accessClass: "authenticated",
      targetMatched: true,
      searchLandmark: false,
      resultsLandmark: false,
      interactionAttempted: false,
      interactionSucceeded: false,
      routeClass,
      expectedLandmark,
      observedLandmark,
    });
    assert.equal(outcome.code, 0, channel);
    assert.equal(outcome.output.receipt.status, "failed", channel);
    assert.equal(outcome.output.receipt.reasonCode, "ui_change", channel);
    assert.deepEqual(outcome.output.receipt.diagnostic, {
      targetMatched: true,
      routeClass,
      expectedLandmark,
      observedLandmark,
    });
  }
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
  const [readme, sharedContract, researchSkill] = await Promise.all([
    readFile("docs/browser-acceptance/README.md", "utf8"),
    readFile("skills/_shared/browser-research-contract.md", "utf8"),
    readFile("skills/social-metadata-research/SKILL.md", "utf8"),
  ]);

  assert.match(readme, /create one new agent\s+tab/i);
  const noUserTabAccess =
    /Never\s+list,\s+enumerate,\s+claim,\s+inspect,\s+or\s+reuse\s+user\s+tabs/i;
  for (const operation of ["tabs.list", "user.openTabs", "user.claimTab"]) {
    assert.match(
      readme,
      noUserTabAccess,
      `${operation} must remain prohibited by the no-user-tab contract`,
    );
  }
  assert.match(readme, /full authenticated DOM snapshot/i);
  assert.match(readme, /`body` text, feed content, account\s+identifiers/i);
  assert.match(readme, /structural booleans[\s\S]*sanitized status code[\s\S]*expected semantic landmark[\s\S]*observed semantic landmark/i);
  assert.match(readme, /raw target handle/i);
  assert.match(readme, /exactly one[\s\S]*in-origin[\s\S]*native Search navigation\s+control/i);
  assert.match(sharedContract, /create one new agent tab/i);
  assert.match(sharedContract, /Never guess a URL or selector/i);
  assert.match(sharedContract, /Never repeat a preflight with a broader tab or DOM read/i);
  assert.match(sharedContract, /finite projection/i);
  assert.match(sharedContract, /closed channel-specific exact accessible-name allowlist/i);
  assert.match(sharedContract, /every role\/name pair directly and separately/i);
  assert.match(sharedContract, /never use a regex or fuzzy match/i);
  assert.match(sharedContract, /Never enumerate or slice `querySelectorAll`/i);
  assert.match(sharedContract, /`targetMatched=true` must use the channel's authenticated-shell\/feed observed landmark/i);
  assert.match(sharedContract, /only `targetMatched=false` may use `target_unavailable`/i);
  assert.match(sharedContract, /inspect only `aria-controls` or `aria-owns` on the already exact-matched entry/i);
  assert.match(sharedContract, /keep the relationship value inside the browser runtime/i);
  assert.match(sharedContract, /exactly one visible related popup/i);
  assert.match(sharedContract, /at most ten visible native suggestions/i);
  assert.match(sharedContract, /Never return or persist the relationship value/i);
  assert.match(sharedContract, /inspect page-global candidate roles/i);
  assert.match(sharedContract, /absent, multiple, conflicting, or still-empty ownership as native empty/i);
  for (const contract of [readme, sharedContract, researchSkill]) {
    assertPostAcknowledgementAcquisitionContract(contract);
  }
});

test("private input fields are visibly rejected", async () => {
  const { output, code } = await run({ ...base, cookies: "secret" });
  assert.equal(code, 2);
  assert.equal(output.ok, false);
  assert.match(output.error, /Forbidden private field/);
  const rawHandle = await run({ ...base, rawHandle: "private-tab-handle" });
  assert.equal(rawHandle.code, 2);
  assert.match(rawHandle.output.error, /Forbidden private field/);
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
