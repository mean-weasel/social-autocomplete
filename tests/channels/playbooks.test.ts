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
    const playbook = getPlaybook(channel);
    assert.equal(routeChannel(request(channel)).status, "ready");
    assert.equal(playbook.dedicatedTarget.ownership, "plugin_owned");
    assert.equal(playbook.dedicatedTarget.acquisition, "new_agent_tab");
    assert.equal(playbook.dedicatedTarget.userTabPolicy, "never_list_claim_inspect_or_reuse");
    assert.equal(playbook.dedicatedTarget.rawHandlePolicy, "host_runtime_only");
    assert.equal(playbook.dedicatedTarget.taskBoundary, "recreate_from_official_root");
    assert.equal(playbook.dedicatedTarget.completion, "release_required");
  }
  assert.equal(getPlaybook("instagram").dedicatedTarget.officialRoot, "https://www.instagram.com/");
});

test("dedicated targets span all browser research and release before validation", () => {
  for (const channel of channels) {
    const stepIds = getPlaybook(channel).steps.map(({ id }) => id);
    const createIndex = stepIds.indexOf("create-dedicated-target");
    const verifyIndex = stepIds.indexOf("verify-surface");
    const sampleIndex = stepIds.indexOf("sample-results");
    const releaseIndex = stepIds.indexOf("release-dedicated-target");
    const validateIndex = stepIds.indexOf("validate");

    assert.ok(createIndex < verifyIndex, `${channel}: create must precede surface verification`);
    assert.ok(releaseIndex > sampleIndex, `${channel}: release must follow browser-dependent research`);
    assert.ok(releaseIndex < validateIndex, `${channel}: release must precede validation`);
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

test("semantic channel routes require a matched target and exact native search entry", () => {
  const base = {
    accessState: "ready" as const,
    localeMatches: true,
    targetMatched: true,
    expectedLandmarksPresent: true,
    searchEntryPresent: true,
    interactionAttempted: false,
    interactionSucceeded: false,
    explicitNativeEmpty: false,
  };
  const readyRoutes = [
    ["facebook_search", "facebook_native_search_entry", "facebook_native_search_entry"],
    ["instagram_search", "instagram_native_search_entry", "instagram_native_search_entry"],
    ["linkedin_search", "linkedin_native_search_entry", "linkedin_native_search_entry"],
    ["pinterest_public_search", "pinterest_search_control", "pinterest_search_control"],
    ["pinterest_personal_search", "pinterest_search_control", "pinterest_search_control"],
  ] as const;
  for (const [routeClass, expectedLandmark, observedLandmark] of readyRoutes) {
    assert.equal(classifySurface({
      ...base,
      diagnostic: {
        routeClass,
        expectedLandmark,
        observedLandmark,
      },
    }).state, "ready");
    assert.equal(classifySurface({
      ...base,
      targetMatched: false,
      diagnostic: {
        routeClass,
        expectedLandmark,
        observedLandmark,
      },
    }).reasonCode, "ui_change");
  }
  const blockedRoutes = [
    ["facebook_authenticated_shell", "facebook_native_search_entry", "facebook_authenticated_navigation"],
    ["facebook_target_unavailable", "facebook_native_search_entry", "target_unavailable"],
    ["instagram_authenticated_shell", "instagram_native_search_entry", "instagram_authenticated_navigation"],
    ["instagram_target_unavailable", "instagram_native_search_entry", "target_unavailable"],
    ["linkedin_authenticated_feed", "linkedin_native_search_entry", "linkedin_authenticated_feed_navigation"],
    ["linkedin_target_unavailable", "linkedin_native_search_entry", "target_unavailable"],
    ["pinterest_business_hub", "pinterest_search_control", "pinterest_business_hub"],
    ["pinterest_root_after_search_redirect", "pinterest_search_control", "pinterest_root"],
  ] as const;
  for (const [routeClass, expectedLandmark, observedLandmark] of blockedRoutes) {
    assert.equal(classifySurface({
      ...base,
      targetMatched: !routeClass.endsWith("target_unavailable"),
      searchEntryPresent: false,
      explicitNativeEmpty: true,
      diagnostic: {
        routeClass,
        expectedLandmark,
        observedLandmark,
      },
    }).reasonCode, "ui_change");
  }
});

test("surface classification fails inconsistent target-match diagnostics", () => {
  const base = {
    accessState: "ready" as const,
    localeMatches: true,
    expectedLandmarksPresent: false,
    searchEntryPresent: false,
    interactionAttempted: false,
    interactionSucceeded: false,
    explicitNativeEmpty: false,
  };
  const cases = [
    ["facebook_search", "facebook_native_search_entry", "facebook_native_search_entry"],
    ["instagram_search", "instagram_native_search_entry", "instagram_native_search_entry"],
    ["linkedin_search", "linkedin_native_search_entry", "linkedin_native_search_entry"],
  ] as const;
  for (const [routeClass, expectedLandmark, observedLandmark] of cases) {
    assert.equal(classifySurface({
      ...base,
      targetMatched: false,
      diagnostic: { routeClass, expectedLandmark, observedLandmark },
    }).reasonCode, "ui_change");
    assert.equal(classifySurface({
      ...base,
      targetMatched: true,
      diagnostic: {
        routeClass: routeClass.replace("_search", "_target_unavailable") as
          | "facebook_target_unavailable"
          | "instagram_target_unavailable"
          | "linkedin_target_unavailable",
        expectedLandmark,
        observedLandmark: "target_unavailable",
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

test("authenticated channels use closed finite accessible-name Search allowlists", () => {
  const expectedNames = {
    instagram: ["Search", "Search input"],
    facebook: ["Search Facebook"],
    linkedin: ["Search", "Search by title, skill, or company", "Click to start a search"],
  } as const;
  for (const channel of ["instagram", "facebook", "linkedin"] as const) {
    const instruction = getPlaybook(channel).entryInstruction;
    assert.match(instruction, /closed exact accessible-name allowlist/i);
    for (const role of ["searchbox", "combobox", "textbox", "link", "button"]) {
      assert.match(instruction, new RegExp(`\\b${role}\\b`, "i"));
    }
    for (const name of expectedNames[channel]) {
      assert.ok(instruction.includes(name), `${channel} is missing exact name ${name}`);
    }
    assert.match(instruction, /each role\/name pair directly/i);
    assert.match(instruction, /exactly one visible allowed match/i);
    assert.match(instruction, /one evidenced in-origin activation/i);
    assert.match(instruction, /one identical repeat/i);
    assert.match(instruction, /target_unavailable is reserved for an unmatched target/i);
  }
});

test("Instagram and Facebook scope autocomplete to one entry-owned popup", () => {
  for (const channel of ["instagram", "facebook"] as const) {
    const instruction = getPlaybook(channel).entryInstruction;
    assert.match(instruction, /aria-controls or aria-owns/i);
    assert.match(instruction, /relationship value runtime-private/i);
    assert.match(instruction, /exactly one visible owned popup/i);
    for (const role of ["option", "listitem", "link", "button"]) {
      assert.match(instruction, new RegExp(`\\b${role}\\b`, "i"));
    }
    assert.match(instruction, /at most ten visible/i);
    assert.match(instruction, /scoped inside it/i);
    assert.match(instruction, /Missing, multiple, or conflicting ownership is ui_change, never native empty/i);
  }
  assert.doesNotMatch(getPlaybook("linkedin").entryInstruction, /aria-controls|aria-owns/i);
});
