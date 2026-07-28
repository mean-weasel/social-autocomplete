import assert from "node:assert/strict";
import test from "node:test";
import { getChannelModulePolicy } from "../../src/channels/policies/index.js";
import { ContractError } from "../../src/contracts/index.js";
import { parseModuleObservationPayload } from "../../src/modules/payloads.js";
import { reduceModule } from "../../src/modules/reducer.js";
import type { ModuleReductionInput } from "../../src/modules/types.js";
import {
  decisionObservation,
  makeObservation,
  makePlan,
  resultObservation,
  sessionObservation,
  suggestionObservation,
  validatedAt,
} from "./helpers.js";

function input(
  plan: ReturnType<typeof makePlan>,
  observations: ModuleReductionInput["observations"],
  refinement: string[] = [],
): ModuleReductionInput {
  const channelRun = plan.channelRuns[0]!;
  const moduleName = channelRun.enabledModules[0]!;
  const policy = getChannelModulePolicy(channelRun.channel, moduleName);
  return {
    moduleName,
    evidenceTier: channelRun.evidenceTier,
    observations,
    plannedPrefixes: {
      initial: plan.approvedPrefixes?.[channelRun.channel]?.[moduleName] ?? [],
      refinement,
    },
    recommendationRange: policy.recommendationRange,
    bounds: {
      maxInitialPrefixes: plan.interactionBounds.maxPrefixesPerModule,
      maxRevisedPrefixes: 2,
      maxSuggestionsPerPrefix: plan.interactionBounds.maxSuggestionsPerPrefix,
      maxResultsPerCandidate: plan.interactionBounds.maxResultsPerCandidate,
      maxRefinementRounds: 1,
      freshnessHours: 24,
    },
    supported: policy.supported,
    ...(policy.notApplicableReason ? { notApplicableReason: policy.notApplicableReason } : {}),
    validatedAt,
  };
}

test("channel-specific recommendation ranges and Pinterest support are stable", () => {
  assert.deepEqual(getChannelModulePolicy("instagram", "hashtag").recommendationRange, { min: 3, max: 5 });
  assert.deepEqual(getChannelModulePolicy("x", "hashtag").recommendationRange, { min: 1, max: 2 });
  assert.equal(getChannelModulePolicy("pinterest", "search-term").supported, true);
  assert.equal(getChannelModulePolicy("pinterest", "hashtag").supported, false);
});

test("autocomplete-only recommendation requires and preserves an exact native value", () => {
  const plan = makePlan("youtube", "hashtag", "autocomplete_only", "#remote");
  const suggestion = suggestionObservation(plan, "hashtag", "#remote", "#RemoteWork");
  const result = reduceModule(input(plan, [
    sessionObservation(plan, "hashtag"),
    suggestion,
    decisionObservation(plan, "hashtag", "#RemoteWork", suggestion.observationId),
  ]));
  assert.equal(result.outcome, "recommended");
  assert.equal(result.researchedRecommendations[0]?.displayedValue, "#RemoteWork");
  assert.equal(result.researchedRecommendations[0]?.canonicalValue, "#remotework");
  assert.ok(result.warnings.some((item) => item.code === "autocomplete_position_not_performance"));
});

test("a selected candidate absent from exact suggestion evidence fails", () => {
  const plan = makePlan("youtube", "search-term", "autocomplete_only", "remote");
  const suggestion = suggestionObservation(plan, "search-term", "remote", "remote work tips");
  const result = reduceModule(input(plan, [
    sessionObservation(plan, "search-term"),
    suggestion,
    decisionObservation(plan, "search-term", "remote work advice", suggestion.observationId),
  ]));
  assert.equal(result.outcome, "failed");
  assert.ok(result.failures.some((item) => item.code === "missing_exact_suggestion_evidence"));
});

test("results_sample accepts three with two relevant or two exhausted and both relevant", () => {
  for (const [count, relevant, exhausted] of [[3, 2, false], [2, 2, true]] as const) {
    const plan = makePlan("instagram", "hashtag", "results_sample", "#remote");
    const suggestion = suggestionObservation(plan, "hashtag", "#remote", "#RemoteTeams");
    const sample = resultObservation(plan, "hashtag", "#RemoteTeams", count, relevant, exhausted);
    const result = reduceModule(input(plan, [
      sessionObservation(plan, "hashtag"),
      suggestion,
      sample,
      decisionObservation(plan, "hashtag", "#RemoteTeams", suggestion.observationId, [sample.observationId]),
    ]));
    assert.equal(result.outcome, "recommended");
  }
});

test("results_sample rejects one result and weak relevance", () => {
  const plan = makePlan("x", "hashtag", "results_sample", "#remote");
  const suggestion = suggestionObservation(plan, "hashtag", "#remote", "#RemoteTeams");
  const sample = resultObservation(plan, "hashtag", "#RemoteTeams", 1, 1, true);
  const result = reduceModule(input(plan, [
    sessionObservation(plan, "hashtag"),
    suggestion,
    sample,
    decisionObservation(plan, "hashtag", "#RemoteTeams", suggestion.observationId, [sample.observationId]),
  ]));
  assert.equal(result.outcome, "failed");
  assert.ok(result.failures.some((item) => item.code === "insufficient_result_relevance"));
});

test("zero requires planned attempts and one bounded refinement unless native empty is definitive", () => {
  const plan = makePlan("linkedin", "hashtag", "autocomplete_only", "#empty");
  const empty = suggestionObservation(plan, "hashtag", "#empty", undefined, 0);
  const zero = makeObservation(plan, "hashtag", "recommendation_decision", "obs_zero", {
    decision: "zero",
    zeroReason: "no_native_candidates",
    rationale: "The native surface explicitly returned no suggestions.",
    suggestionEvidenceIds: [empty.observationId],
  });
  const result = reduceModule(input(plan, [sessionObservation(plan, "hashtag"), empty, zero]));
  assert.equal(result.outcome, "zero");
  assert.equal(result.zeroReason, "no_native_candidates");
});

test("Pinterest hashtag is explicitly not applicable without browser evidence", () => {
  const plan = makePlan("pinterest", "hashtag", "autocomplete_only", "#ideas");
  const result = reduceModule(input(plan, []));
  assert.equal(result.outcome, "not_applicable");
  assert.equal(result.notApplicableReason, "hashtags_not_supported_on_pinterest");
  assert.deepEqual(result.evidenceReferences, []);
});

test("model suggestions remain outside researched recommendations", () => {
  const plan = makePlan("facebook", "search-term", "autocomplete_only", "remote");
  const result = reduceModule(input(plan, [
    sessionObservation(plan, "search-term"),
    decisionObservation(plan, "search-term", "invented phrase", "missing", [], "model"),
  ]));
  assert.equal(result.researchedRecommendations.length, 0);
  assert.equal(result.modelSuggestions[0]?.displayedValue, "invented phrase");
  assert.ok(result.warnings.some((item) => item.code === "model_suggestion_excluded"));
});

test("evidence older than 24 hours fails freshness validation", () => {
  const plan = makePlan("facebook", "search-term", "autocomplete_only", "remote");
  const suggestion = suggestionObservation(plan, "search-term", "remote", "remote work tips");
  suggestion.capturedAt = "2026-07-25T14:00:00-07:00";
  const result = reduceModule(input(plan, [
    sessionObservation(plan, "search-term"),
    suggestion,
    decisionObservation(plan, "search-term", "remote work tips", suggestion.observationId),
  ]));
  assert.equal(result.outcome, "failed");
  assert.ok(result.failures.some((item) => item.code === "stale_evidence"));
});

test("authentication pauses are interrupted and UI changes are failed", () => {
  for (const [reason, expected] of [["authentication_required", "interrupted"], ["ui_change", "failed"]] as const) {
    const plan = makePlan("facebook", "search-term", "autocomplete_only", "remote");
    const interruption = makeObservation(plan, "search-term", "interruption", `obs_${reason}`, { reason });
    const result = reduceModule(input(plan, [interruption]));
    assert.equal(result.outcome, expected);
  }
});

test("hashtag and search-term payload parsing remains isolated", () => {
  const plan = makePlan("youtube", "hashtag", "autocomplete_only", "#remote");
  const invalid = suggestionObservation(plan, "hashtag", "#remote", "remote without hash");
  assert.throws(
    () => parseModuleObservationPayload(invalid),
    (error) => error instanceof ContractError && error.issues.some((item) => item.code === "invalid_hashtag"),
  );
  const searchPlan = makePlan("youtube", "search-term", "autocomplete_only", "remote");
  const valid = suggestionObservation(searchPlan, "search-term", "remote", "remote without hash");
  assert.doesNotThrow(() => parseModuleObservationPayload(valid));
});

test("provider evidence may enrich but cannot replace native autocomplete evidence", () => {
  const plan = makePlan("youtube", "search-term", "autocomplete_only", "remote");
  const browserSuggestion = suggestionObservation(plan, "search-term", "remote", "remote work tips");
  const providerSuggestion = {
    ...suggestionObservation(plan, "search-term", "remote", "remote work tips"),
    observationId: "obs_provider_suggestion",
    source: {
      ...browserSuggestion.source,
      kind: "provider_api" as const,
      browser: "none",
      surface: "provider_search",
    },
  };
  const providerOnly = reduceModule(input(plan, [
    sessionObservation(plan, "search-term"),
    providerSuggestion,
    decisionObservation(plan, "search-term", "remote work tips", providerSuggestion.observationId),
  ]));
  assert.equal(providerOnly.outcome, "failed");
  assert.ok(providerOnly.failures.some((item) => item.code === "missing_exact_suggestion_evidence"));

  const enrichedDecision = decisionObservation(
    plan,
    "search-term",
    "remote work tips",
    browserSuggestion.observationId,
  );
  (enrichedDecision.payload as any).suggestionEvidenceIds.push(providerSuggestion.observationId);
  const enriched = reduceModule(input(plan, [
    sessionObservation(plan, "search-term"),
    browserSuggestion,
    providerSuggestion,
    enrichedDecision,
  ]));
  assert.equal(enriched.outcome, "recommended");
});

test("result evidence must be fresh, native, and access-mode consistent", () => {
  const plan = makePlan("instagram", "hashtag", "results_sample", "#remote");
  const suggestion = suggestionObservation(plan, "hashtag", "#remote", "#RemoteTeams");
  const staleSample = resultObservation(plan, "hashtag", "#RemoteTeams", 3, 2, false);
  staleSample.capturedAt = "2026-07-25T14:00:00-07:00";
  const stale = reduceModule(input(plan, [
    sessionObservation(plan, "hashtag"),
    suggestion,
    staleSample,
    decisionObservation(plan, "hashtag", "#RemoteTeams", suggestion.observationId, [staleSample.observationId]),
  ]));
  assert.ok(stale.failures.some((item) => item.code === "stale_result_evidence"));

  const publicSample = resultObservation(plan, "hashtag", "#RemoteTeams", 3, 2, false);
  publicSample.source.accessMode = "public";
  const mixed = reduceModule(input(plan, [
    sessionObservation(plan, "hashtag"),
    suggestion,
    publicSample,
    decisionObservation(plan, "hashtag", "#RemoteTeams", suggestion.observationId, [publicSample.observationId]),
  ]));
  assert.ok(mixed.failures.some((item) => item.code === "mixed_access_modes"));
});

test("module interaction bounds are enforced during reduction", () => {
  const plan = makePlan("youtube", "search-term", "autocomplete_only", "remote");
  plan.interactionBounds.maxSuggestionsPerPrefix = 1;
  const suggestion = suggestionObservation(plan, "search-term", "remote", "remote work tips");
  (suggestion.payload as any).suggestions.push({
    displayedValue: "remote work advice",
    displayPosition: 2,
  });
  const result = reduceModule(input(plan, [
    sessionObservation(plan, "search-term"),
    suggestion,
    decisionObservation(plan, "search-term", "remote work tips", suggestion.observationId),
  ]));
  assert.equal(result.outcome, "failed");
  assert.ok(result.failures.some((item) => item.code === "suggestion_bound_exceeded"));
});
