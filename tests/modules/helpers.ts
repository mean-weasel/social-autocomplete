import type {
  Channel,
  EvidenceTier,
  JsonValue,
  ModuleName,
  Observation,
  OrchestrationMode,
  StoredPlan,
} from "../../src/contracts/index.js";

export const capturedAt = "2026-07-27T14:30:00-07:00";
export const validatedAt = "2026-07-27T15:00:00-07:00";

export function makePlan(
  channel: Channel,
  moduleName: ModuleName,
  tier: EvidenceTier,
  prefix: string,
  mode: OrchestrationMode = "guided",
): StoredPlan {
  return {
    contractVersion: "1.0",
    runId: `run_${channel}_${moduleName.replace("-", "_")}`,
    creativeBrief: { summary: "Practical remote-work habits for small software teams." },
    inputReferences: [],
    channels: [channel],
    locale: { uiLocale: "en-US", region: "US", timezone: "America/Phoenix" },
    orchestrationMode: mode,
    enabledModules: [moduleName],
    defaultEvidenceTier: tier,
    browserSelection: { browser: "chrome", confirmedByUser: true },
    approvedPrefixes: { [channel]: { [moduleName]: [prefix] } },
    interactionBounds: {
      maxPrefixesPerModule: 3,
      maxSuggestionsPerPrefix: 10,
      maxResultsPerCandidate: 3,
      maxRefinementRounds: 1,
    },
    createdAt: "2026-07-27T14:00:00-07:00",
    channelRuns: [{
      channelRunId: `channel_${channel}`,
      channel,
      enabledModules: [moduleName],
      evidenceTier: tier,
    }],
  };
}

export function makeObservation(
  plan: StoredPlan,
  moduleName: ModuleName,
  kind: Observation["kind"],
  id: string,
  payload: JsonValue,
  typedText?: string,
  timestamp = capturedAt,
): Observation {
  const channelRun = plan.channelRuns[0]!;
  return {
    contractVersion: "1.0",
    observationId: id,
    runId: plan.runId,
    channelRunId: channelRun.channelRunId,
    capturedAt: timestamp,
    source: {
      kind: "browser_ui",
      channel: channelRun.channel,
      browser: "chrome",
      accessMode: "authenticated",
      uiLocale: "en-US",
      region: "US",
      timezone: "America/Phoenix",
      personalizedSession: true,
      surface: kind === "suggestion_set" ? "autocomplete" : "search_results",
    },
    module: { name: moduleName, schemaVersion: "1.0" },
    kind,
    ...(typedText ? { query: { typedText } } : {}),
    payload,
  };
}

export function sessionObservation(plan: StoredPlan, moduleName: ModuleName): Observation {
  return makeObservation(plan, moduleName, "session_state", `obs_${moduleName}_session`, {
    ready: true,
    authenticated: true,
  });
}

export function suggestionObservation(
  plan: StoredPlan,
  moduleName: ModuleName,
  prefix: string,
  candidate?: string,
  round: 0 | 1 = 0,
): Observation {
  return makeObservation(
    plan,
    moduleName,
    "suggestion_set",
    `obs_${moduleName.replace("-", "_")}_suggestion_${round}`,
    {
      suggestions: candidate ? [{ displayedValue: candidate, displayPosition: 1 }] : [],
      stoppingReason: candidate ? "visible_list_exhausted" : "native_empty",
      round,
    },
    prefix,
  );
}

export function decisionObservation(
  plan: StoredPlan,
  moduleName: ModuleName,
  candidate: string,
  suggestionId: string,
  resultIds: string[] = [],
  origin: "native" | "model" = "native",
): Observation {
  return makeObservation(plan, moduleName, "recommendation_decision", `obs_${moduleName.replace("-", "_")}_decision_${origin}`, {
    decision: "selected",
    candidate,
    rationale: "The exact native candidate directly matches the creative brief.",
    suggestionEvidenceIds: [suggestionId],
    resultEvidenceIds: resultIds,
    origin,
    seedProvenance: { kind: "creative_brief", value: "remote work" },
  });
}

export function resultObservation(
  plan: StoredPlan,
  moduleName: ModuleName,
  candidate: string,
  count: number,
  relevantCount: number,
  surfaceExhausted: boolean,
  engagement = false,
): Observation {
  return makeObservation(plan, moduleName, "result_sample", `obs_${moduleName.replace("-", "_")}_results`, {
    candidate,
    results: Array.from({ length: count }, (_, index) => ({
      position: index + 1,
      summary: `Visible result ${index + 1}`,
      relevance: index < relevantCount ? "relevant" : "mixed",
      relevanceRationale: index < relevantCount
        ? "Directly addresses the creative brief."
        : "Only partially overlaps the topic.",
      ...(engagement ? { visibleEngagement: [{ label: "likes", value: `${100 - index}` }] } : {}),
    })),
    surfaceExhausted,
    noResults: count === 0,
    stoppingReason: count === 0
      ? "native_no_results"
      : surfaceExhausted
        ? "surface_exhausted"
        : "result_bound_reached",
  });
}
