import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySurface, getPlaybook, routeChannel } from "../../src/channels/index.js";
import type { Channel, EvidenceTier, ModuleName } from "../../src/contracts/index.js";

const channels: Channel[] = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube", "pinterest"];

function request(
  channel: Channel,
  module: ModuleName = "search-term",
  overrides: Partial<Parameters<typeof routeChannel>[0]> = {},
) {
  return {
    channel,
    module,
    evidenceTier: "autocomplete_only" as EvidenceTier,
    host: "codex" as const,
    browser: "chrome" as const,
    accessMode: "authenticated" as const,
    ...overrides,
  };
}

test("all channel playbooks are addressable through the thin router", () => {
  assert.deepEqual(channels.map((channel) => getPlaybook(channel).channel), channels);
  for (const channel of channels) {
    assert.equal(routeChannel(request(channel)).status, "ready");
  }
});

test("router enforces access and host browser policy without doing research", () => {
  assert.equal(routeChannel(request("facebook", "hashtag", { accessMode: "public" })).status, "interrupted");
  for (const channel of ["tiktok", "youtube", "pinterest"] as const) {
    assert.equal(routeChannel(request(channel, "search-term", { accessMode: "public", browser: "in_app" })).status, "ready");
  }
  assert.equal(routeChannel(request("youtube", "search-term", { host: "claude", browser: "in_app" })).status, "failed");
  const routerText = routeChannel.toString();
  for (const prohibited of ["navigate", "publish", "composer", "rankCandidate", "selectCandidate"]) {
    assert.equal(routerText.includes(prohibited), false);
  }
});

test("Pinterest hashtag is explicitly not applicable before browser access", () => {
  const decision = routeChannel(request("pinterest", "hashtag", {
    host: "claude",
    browser: "in_app",
    accessMode: "public",
  }));
  assert.equal(decision.status, "not_applicable");
  assert.equal(decision.reasonCode, "module_not_applicable");
});

test("surface diagnostics keep native empty distinct from authentication and UI change", () => {
  const base = {
    accessState: "ready" as const,
    localeMatches: true,
    expectedLandmarksPresent: true,
    interactionAttempted: true,
    interactionSucceeded: true,
    explicitNativeEmpty: false,
  };
  assert.deepEqual(classifySurface({ ...base, explicitNativeEmpty: true }), { state: "native_empty", exitCode: 0 });
  assert.deepEqual(
    classifySurface({ ...base, interactionSucceeded: false, explicitNativeEmpty: true }),
    { state: "failed", reasonCode: "ui_change", exitCode: 5 },
  );
  assert.equal(classifySurface({ ...base, accessState: "authentication_required" }).exitCode, 4);
  assert.equal(classifySurface({ ...base, localeMatches: false }).exitCode, 6);
});

test("LinkedIn and Pinterest require an evidenced semantic search entry", () => {
  const base = {
    accessState: "ready" as const,
    localeMatches: true,
    expectedLandmarksPresent: true,
    searchEntryPresent: true,
    interactionAttempted: false,
    interactionSucceeded: false,
    explicitNativeEmpty: false,
  };
  assert.equal(classifySurface({
    ...base,
    diagnostic: {
      routeClass: "linkedin_search",
      expectedLandmark: "linkedin_native_search_entry",
      observedLandmark: "linkedin_native_search_entry",
    },
  }).state, "ready");
  for (const routeClass of ["pinterest_public_search", "pinterest_personal_search"] as const) {
    assert.equal(classifySurface({
      ...base,
      diagnostic: {
        routeClass,
        expectedLandmark: "pinterest_search_control",
        observedLandmark: "pinterest_search_control",
      },
    }).state, "ready");
  }
  assert.deepEqual(classifySurface({
    ...base,
    searchEntryPresent: false,
    explicitNativeEmpty: true,
    diagnostic: {
      routeClass: "linkedin_authenticated_feed",
      expectedLandmark: "linkedin_native_search_entry",
      observedLandmark: "linkedin_authenticated_feed_navigation",
    },
  }), {
    state: "failed",
    reasonCode: "ui_change",
    exitCode: 5,
    diagnostic: {
      routeClass: "linkedin_authenticated_feed",
      expectedLandmark: "linkedin_native_search_entry",
      observedLandmark: "linkedin_authenticated_feed_navigation",
    },
  });
  for (const routeClass of ["pinterest_business_hub", "pinterest_root_after_search_redirect"] as const) {
    assert.equal(classifySurface({
      ...base,
      searchEntryPresent: false,
      explicitNativeEmpty: true,
      diagnostic: {
        routeClass,
        expectedLandmark: "pinterest_search_control",
        observedLandmark: routeClass === "pinterest_business_hub" ? "pinterest_business_hub" : "pinterest_root",
      },
    }).reasonCode, "ui_change");
  }
});

test("channel caveats preserve observed limitations", () => {
  assert.match(getPlaybook("linkedin").modules.hashtag.zeroPolicy, /refinement/i);
  assert.equal(getPlaybook("linkedin").modules["search-term"].autocompleteEvidence, "acceptance_gap");
  assert.equal(
    getPlaybook("linkedin").semanticCheckpoints.find(({ id }) => id === "linkedin-search")?.evidenceStatus,
    "acceptance_gap",
  );
  assert.match(getPlaybook("pinterest").entryInstruction, /Business Hub.*ui_change/i);
  assert.ok(getPlaybook("x").modules["search-term"].excludedCandidateKinds.includes("search_action"));
  assert.equal(getPlaybook("tiktok").modules.hashtag.autocompleteEvidence, "acceptance_gap");
  assert.equal(getPlaybook("youtube").modules.hashtag.autocompleteEvidence, "confirmed_live");
});
