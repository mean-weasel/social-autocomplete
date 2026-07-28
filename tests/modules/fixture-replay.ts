import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  Channel,
  EvidenceTier,
  ModuleName,
  OrchestrationMode,
  PlanAmendment,
} from "../../src/contracts/index.js";
import { createModulePlans } from "../../src/modules/planner.js";
import { reduceChannelModules } from "../../src/modules/registry.js";
import {
  decisionObservation,
  makeObservation,
  makePlan,
  resultObservation,
  sessionObservation,
  suggestionObservation,
  validatedAt,
} from "./helpers.js";

interface ReplayCase {
  id: string;
  channel: Channel;
  module: ModuleName;
  tier: EvidenceTier;
  mode: OrchestrationMode;
  prefix: string;
  refinementPrefix?: string;
  candidate?: string;
  resultCount?: number;
  relevantCount?: number;
  surfaceExhausted?: boolean;
  visibleEngagement?: boolean;
  zeroReason?: "no_native_candidates";
  expectedOutcome: string;
}

export async function runFixtureReplay(): Promise<{ cases: number; ids: string[] }> {
  const cases = JSON.parse(
    await readFile(resolve("fixtures/modules/replay-cases.json"), "utf8"),
  ) as ReplayCase[];
  const ids: string[] = [];
  for (const fixture of cases) {
    const plan = makePlan(fixture.channel, fixture.module, fixture.tier, fixture.prefix, fixture.mode);
    const amendments: PlanAmendment[] = fixture.refinementPrefix
      ? [{
          contractVersion: "1.0",
          amendmentId: `amendment_${fixture.id}`,
          runId: plan.runId,
          createdAt: "2026-07-27T14:10:00-07:00",
          reason: "One bounded refinement round.",
          changes: {
            refinementPrefixes: {
              [fixture.channel]: { [fixture.module]: [fixture.refinementPrefix] },
            },
          },
        }]
      : [];
    const policyPlan = createModulePlans(plan, amendments)[0]!;
    assert.equal(policyPlan.bounds.maxRefinementRounds, 1, fixture.id);
    const observations = [];
    if (fixture.expectedOutcome !== "not_applicable") {
      observations.push(sessionObservation(plan, fixture.module));
      if (fixture.refinementPrefix) {
        observations.push(suggestionObservation(plan, fixture.module, fixture.prefix, undefined, 0));
      }
      const prefix = fixture.refinementPrefix ?? fixture.prefix;
      const round = fixture.refinementPrefix ? 1 : 0;
      const suggestion = suggestionObservation(plan, fixture.module, prefix, fixture.candidate, round);
      observations.push(suggestion);
      if (fixture.zeroReason) {
        observations.push(makeObservation(plan, fixture.module, "recommendation_decision", `obs_zero_${fixture.id}`, {
          decision: "zero",
          zeroReason: fixture.zeroReason,
          rationale: "The current native autocomplete surface explicitly returned no candidates.",
          suggestionEvidenceIds: [suggestion.observationId],
        }));
      } else if (fixture.candidate) {
        const resultIds: string[] = [];
        if (fixture.tier === "results_sample") {
          const sample = resultObservation(
            plan,
            fixture.module,
            fixture.candidate,
            fixture.resultCount ?? 3,
            fixture.relevantCount ?? 2,
            fixture.surfaceExhausted ?? false,
            fixture.visibleEngagement ?? false,
          );
          observations.push(sample);
          resultIds.push(sample.observationId);
        }
        observations.push(decisionObservation(
          plan,
          fixture.module,
          fixture.candidate,
          suggestion.observationId,
          resultIds,
        ));
      }
    }
    const reduced = reduceChannelModules(
      plan,
      amendments,
      observations,
      plan.channelRuns[0]!.channelRunId,
      validatedAt,
    );
    assert.equal(reduced.moduleResults[0]?.outcome, fixture.expectedOutcome, fixture.id);
    ids.push(fixture.id);
  }
  return { cases: cases.length, ids };
}
