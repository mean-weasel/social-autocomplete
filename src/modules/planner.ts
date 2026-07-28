import type {
  Channel,
  ModuleName,
  PlanAmendment,
  StoredPlan,
} from "../contracts/index.js";
import { getChannelModulePolicy } from "../channels/policies/index.js";

export interface ModulePlan {
  channelRunId: string;
  channel: Channel;
  module: ModuleName;
  supported: boolean;
  recommendationRange: { min: number; max: number } | null;
  evidenceTier: "autocomplete_only" | "results_sample";
  prefixes: { initial: string[]; refinement: string[] };
  bounds: {
    maxInitialPrefixes: number;
    maxRevisedPrefixes: number;
    maxSuggestionsPerPrefix: number;
    maxResultsPerCandidate: number;
    maxRefinementRounds: 1;
    freshnessHours: 24;
  };
}

function prefixState(
  plan: StoredPlan,
  amendments: PlanAmendment[],
): NonNullable<StoredPlan["approvedPrefixes"]> {
  const prefixes = structuredClone(plan.approvedPrefixes ?? {});
  for (const amendment of amendments) {
    const changes = amendment.changes as {
      approvedPrefixes?: StoredPlan["approvedPrefixes"];
    };
    const source = changes.approvedPrefixes;
    if (!source) continue;
    for (const [channel, modules] of Object.entries(source)) {
      prefixes[channel as Channel] = {
        ...(prefixes[channel as Channel] ?? {}),
        ...modules,
      };
    }
  }
  return prefixes;
}

export function createModulePlans(plan: StoredPlan, amendments: PlanAmendment[]): ModulePlan[] {
  const prefixes = prefixState(plan, amendments);
  return plan.channelRuns.flatMap((channelRun) =>
    channelRun.enabledModules.map((moduleName) => {
      const policy = getChannelModulePolicy(channelRun.channel, moduleName);
      const initial = prefixes[channelRun.channel]?.[moduleName] ?? [];
      let refinement: string[] = [];
      for (const amendment of amendments) {
        const refinementChange =
          (amendment.changes as { refinementPrefixes?: StoredPlan["approvedPrefixes"] }).refinementPrefixes;
        const candidate = refinementChange?.[channelRun.channel]?.[moduleName];
        if (candidate) refinement = candidate;
      }
      return {
        channelRunId: channelRun.channelRunId,
        channel: channelRun.channel,
        module: moduleName,
        supported: policy.supported,
        recommendationRange: policy.recommendationRange,
        evidenceTier: channelRun.evidenceTier,
        prefixes: { initial, refinement },
        bounds: {
          maxInitialPrefixes: plan.interactionBounds.maxPrefixesPerModule,
          maxRevisedPrefixes: 2,
          maxSuggestionsPerPrefix: plan.interactionBounds.maxSuggestionsPerPrefix,
          maxResultsPerCandidate: Math.min(plan.interactionBounds.maxResultsPerCandidate, 3),
          maxRefinementRounds: 1,
          freshnessHours: 24,
        },
      };
    }),
  );
}
