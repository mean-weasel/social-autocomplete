import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { classifySurface } from "../../src/channels/index.js";
import type {
  SurfaceExpectedLandmark,
  SurfaceObservedLandmark,
  SurfaceRouteClass,
} from "../../src/channels/types.js";

const execFileAsync = promisify(execFile);

test("diagnostic fixtures distinguish empty, auth, UI change, load failure, and locale", async () => {
  const fixtures = JSON.parse(await readFile("fixtures/diagnostics/surface-cases.json", "utf8"));
  assert.deepEqual(
    fixtures.map((fixture: { id: string }) => fixture.id),
    [
      "ready",
      "preflight-ready-before-results",
      "missing-search-ui",
      "moved-search-ui",
      "login-consent",
      "challenge",
      "native-empty",
      "load-failure",
      "locale-mismatch",
      "facebook-target-unavailable",
      "facebook-search-ready",
      "facebook-authenticated-shell-missing-search",
      "instagram-authenticated-shell-missing-search",
      "instagram-search-ready",
      "instagram-target-unavailable",
      "linkedin-authenticated-feed-missing-search",
      "linkedin-target-unavailable",
      "pinterest-business-hub-missing-search",
      "pinterest-public-search-ready",
      "pinterest-business-not-challenge",
    ],
  );
  for (const fixture of fixtures) {
    const input = {
      ...fixture,
      host: "codex",
      browser: "chrome",
      channel: fixture.channel ?? "youtube",
      module: "search-term",
      accessClass: "authenticated",
      locale: { uiLocale: "en-US", region: "US", timezone: "America/Phoenix" },
    };
    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/browser-acceptance/run.mjs",
      "--input",
      JSON.stringify(input),
    ]);
    const receipt = JSON.parse(stdout).receipt;
    assert.equal(receipt.status, fixture.expectedStatus, fixture.id);
    assert.equal(receipt.reasonCode ?? null, fixture.expectedReason, fixture.id);
    assert.equal(receipt.screenshot.captured, fixture.screenshotDefault, fixture.id);
  }
});

test("variant diagnostics use bounded route and landmark enumerations", async () => {
  const fixtures = JSON.parse(await readFile("fixtures/diagnostics/surface-cases.json", "utf8"));
  const variants = fixtures.filter(({ routeClass }: { routeClass?: string }) => routeClass);
  for (const fixture of variants as Array<{
    id: string;
    targetMatched: boolean;
    accessState: "ready";
    localeMatches: boolean;
    searchEntryPresent: boolean;
    interactionAttempted: boolean;
    interactionSucceeded: boolean;
    explicitNativeEmpty: boolean;
    routeClass: SurfaceRouteClass;
    expectedLandmark: SurfaceExpectedLandmark;
    observedLandmark: SurfaceObservedLandmark;
    expectedReason: string | null;
    expectedStatus: "pass" | "failed";
  }>) {
    const classification = classifySurface({
      accessState: fixture.accessState,
      localeMatches: fixture.localeMatches,
      targetMatched: fixture.targetMatched,
      expectedLandmarksPresent: fixture.searchEntryPresent,
      searchEntryPresent: fixture.searchEntryPresent,
      interactionAttempted: fixture.interactionAttempted,
      interactionSucceeded: fixture.interactionSucceeded,
      explicitNativeEmpty: fixture.explicitNativeEmpty,
      diagnostic: {
        routeClass: fixture.routeClass,
        expectedLandmark: fixture.expectedLandmark,
        observedLandmark: fixture.observedLandmark,
      },
    });
    assert.equal(classification.state, fixture.expectedStatus === "pass" ? "ready" : "failed", fixture.id);
    assert.equal(classification.reasonCode ?? null, fixture.expectedReason, fixture.id);
    assert.deepEqual(classification.diagnostic, {
      routeClass: fixture.routeClass,
      expectedLandmark: fixture.expectedLandmark,
      observedLandmark: fixture.observedLandmark,
    });
    assert.doesNotMatch(JSON.stringify(classification.diagnostic), /https?:|@|body|dom|selector/i);
  }
});

test("acceptance matrix keeps Pinterest hashtag not applicable", async () => {
  const matrix = JSON.parse(await readFile("fixtures/diagnostics/acceptance-matrix.json", "utf8"));
  assert.deepEqual(matrix.notApplicable, [{ channel: "pinterest", module: "hashtag" }]);
  assert.deepEqual(matrix.diagnosticEnums.facebook.routes, [
    "facebook_search",
    "facebook_authenticated_shell",
    "facebook_target_unavailable",
  ]);
  assert.deepEqual(matrix.diagnosticEnums.instagram.routes, [
    "instagram_search",
    "instagram_authenticated_shell",
    "instagram_target_unavailable",
  ]);
  assert.deepEqual(matrix.diagnosticEnums.linkedin.routes, [
    "linkedin_search",
    "linkedin_authenticated_feed",
    "linkedin_target_unavailable",
  ]);
  assert.ok(matrix.diagnosticEnums.pinterest.routes.includes("pinterest_root_after_search_redirect"));
});
