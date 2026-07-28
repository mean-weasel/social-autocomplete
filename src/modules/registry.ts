import type { Observation, PlanAmendment, StoredPlan } from "../contracts/index.js";
import { getChannelModulePolicy } from "../channels/policies/index.js";
import { createModulePlans } from "./planner.js";
import { reduceModule } from "./reducer.js";
import type { ModuleResult } from "./types.js";

export interface ChannelModuleReduction {
  channelRunId: string;
  moduleResults: ModuleResult[];
  complete: boolean;
}

export function reduceChannelModules(
  plan: StoredPlan,
  amendments: PlanAmendment[],
  observations: Observation[],
  channelRunId: string,
  validatedAt: string,
): ChannelModuleReduction {
  const channelRun = plan.channelRuns.find((item) => item.channelRunId === channelRunId);
  if (!channelRun) {
    return { channelRunId, moduleResults: [], complete: false };
  }
  const modulePlans = createModulePlans(plan, amendments).filter(
    (item) => item.channelRunId === channelRunId,
  );
  const channelObservations = observations.filter((item) => item.channelRunId === channelRunId);
  const moduleResults = modulePlans.map((modulePlan) => {
    const policy = getChannelModulePolicy(channelRun.channel, modulePlan.module);
    return reduceModule({
      moduleName: modulePlan.module,
      evidenceTier: modulePlan.evidenceTier,
      observations: channelObservations,
      plannedPrefixes: modulePlan.prefixes,
      recommendationRange: policy.recommendationRange,
      bounds: modulePlan.bounds,
      supported: policy.supported,
      ...(policy.notApplicableReason ? { notApplicableReason: policy.notApplicableReason } : {}),
      validatedAt,
    });
  });
  return {
    channelRunId,
    moduleResults,
    complete: moduleResults.every((item) =>
      item.outcome === "recommended" || item.outcome === "zero" || item.outcome === "not_applicable"
    ),
  };
}

export * from "./payloads.js";
export * from "./planner.js";
export * from "./reducer.js";
export * from "./types.js";
