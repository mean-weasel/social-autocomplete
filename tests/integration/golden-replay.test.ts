import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { classifySurface } from "../../src/channels/index.js";
import type {
  Channel,
  EvidenceTier,
  ModuleName,
  Observation,
  OrchestrationMode,
} from "../../src/contracts/index.js";
import { reduceChannelModules } from "../../src/modules/registry.js";
import {
  decisionObservation,
  makeObservation,
  makePlan,
  resultObservation,
  sessionObservation,
  suggestionObservation,
  validatedAt,
} from "../modules/helpers.js";

type Scenario =
  | "native_success"
  | "native_zero"
  | "authentication"
  | "ui_change"
  | "locale_mismatch"
  | "stale"
  | "authentication_resume"
  | "ui_change_resume"
  | "not_applicable";

interface Golden {
  id: string;
  channel: Channel;
  module: ModuleName;
  tier: EvidenceTier;
  mode: OrchestrationMode;
  scenario: Scenario;
  prefix: string;
  candidate: string;
  expected: string;
}

function observationsFor(fixture: Golden): { observations: Observation[]; refinement: string[] } {
  const plan = makePlan(fixture.channel, fixture.module, fixture.tier, fixture.prefix, fixture.mode);
  if (fixture.scenario === "not_applicable") return { observations: [], refinement: [] };
  if (fixture.scenario === "locale_mismatch") return { observations: [], refinement: [] };
  if (fixture.scenario === "authentication" || fixture.scenario === "ui_change") {
    return {
      observations: [makeObservation(plan, fixture.module, "interruption", `obs_${fixture.id}`, {
        reason: fixture.scenario === "ui_change" ? "ui_change" : "authentication_required",
      })],
      refinement: [],
    };
  }

  const observations: Observation[] = [];
  if (fixture.scenario === "authentication_resume" || fixture.scenario === "ui_change_resume") {
    observations.push(makeObservation(plan, fixture.module, "interruption", `obs_interrupt_${fixture.id}`, {
      reason: fixture.scenario === "ui_change_resume" ? "ui_change" : "authentication_required",
    }));
  }
  const session = sessionObservation(plan, fixture.module);
  if (fixture.scenario === "stale") session.capturedAt = "2026-07-25T10:00:00-07:00";
  session.source.browser = "HOST_BROWSER";
  observations.push(session);
  if (fixture.scenario === "ui_change_resume") {
    observations.push(makeObservation(plan, fixture.module, "diagnostic", `obs_diag_${fixture.id}`, {
      resolution: "assisted_resume",
      checkpointsRestored: true,
    }));
  }
  if (fixture.scenario === "native_zero") {
    const initial = suggestionObservation(plan, fixture.module, fixture.prefix, undefined, 0);
    const refinementPrefix = `${fixture.prefix} tips`;
    const refinement = suggestionObservation(plan, fixture.module, refinementPrefix, undefined, 1);
    observations.push(initial, refinement);
    observations.push(makeObservation(plan, fixture.module, "recommendation_decision", `obs_zero_${fixture.id}`, {
      decision: "zero",
      zeroReason: "no_native_candidates",
      rationale: "Both current native autocomplete attempts explicitly returned no candidates.",
      suggestionEvidenceIds: [initial.observationId, refinement.observationId],
    }));
    return { observations, refinement: [refinementPrefix] };
  }

  const suggestion = suggestionObservation(plan, fixture.module, fixture.prefix, fixture.candidate);
  if (fixture.scenario === "stale") suggestion.capturedAt = "2026-07-25T10:01:00-07:00";
  suggestion.source.browser = "HOST_BROWSER";
  observations.push(suggestion);
  const resultIds: string[] = [];
  if (fixture.tier === "results_sample") {
    const result = resultObservation(plan, fixture.module, fixture.candidate, 3, 2, false, true);
    result.source.browser = "HOST_BROWSER";
    observations.push(result);
    resultIds.push(result.observationId);
  }
  observations.push(decisionObservation(plan, fixture.module, fixture.candidate, suggestion.observationId, resultIds));
  return { observations, refinement: [] };
}

test("golden replay covers every channel/module and preserves host-equivalent module receipts", async () => {
  const fixtures = JSON.parse(
    await readFile("fixtures/integration/all-channel-golden.json", "utf8"),
  ) as Golden[];
  assert.equal(fixtures.length, 14);
  assert.deepEqual(
    [...new Set(fixtures.map(({ channel }) => channel))].sort(),
    ["facebook", "instagram", "linkedin", "pinterest", "tiktok", "x", "youtube"],
  );
  for (const channel of new Set(fixtures.map(({ channel }) => channel))) {
    assert.deepEqual(
      fixtures.filter((fixture) => fixture.channel === channel).map(({ module }) => module).sort(),
      ["hashtag", "search-term"],
    );
  }
  assert.deepEqual([...new Set(fixtures.map(({ tier }) => tier))].sort(), ["autocomplete_only", "results_sample"]);
  assert.deepEqual([...new Set(fixtures.map(({ mode }) => mode))].sort(), ["automatic", "guided"]);

  for (const fixture of fixtures) {
    if (fixture.scenario === "locale_mismatch") {
      assert.equal(classifySurface({
        accessState: "ready",
        localeMatches: false,
        expectedLandmarksPresent: true,
        interactionAttempted: false,
        interactionSucceeded: false,
        explicitNativeEmpty: false,
      }).state, fixture.expected, fixture.id);
      continue;
    }
    const plan = makePlan(fixture.channel, fixture.module, fixture.tier, fixture.prefix, fixture.mode);
    const built = observationsFor(fixture);
    const reductions = ["chrome", "in_app"].map((browser) => {
      const hostObservations = structuredClone(built.observations);
      for (const observation of hostObservations) {
        if (observation.source.browser === "HOST_BROWSER") observation.source.browser = browser;
      }
      const amendments = built.refinement.length === 0 ? [] : [{
        contractVersion: "1.0" as const,
        amendmentId: `amend_${fixture.id}`,
        runId: plan.runId,
        createdAt: "2026-07-27T14:15:00-07:00",
        reason: "One bounded refinement round.",
        changes: { refinementPrefixes: { [fixture.channel]: { [fixture.module]: built.refinement } } },
      }];
      return reduceChannelModules(
        plan,
        amendments,
        hostObservations,
        plan.channelRuns[0]!.channelRunId,
        validatedAt,
      ).moduleResults[0]!;
    });
    assert.equal(reductions[0]!.outcome, fixture.expected, fixture.id);
    assert.deepEqual(reductions[0], reductions[1], `${fixture.id}: host parity`);
  }
});
