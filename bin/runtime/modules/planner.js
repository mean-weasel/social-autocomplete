import { getChannelModulePolicy } from "../channels/policies/index.js";
function prefixState(plan, amendments) {
    const prefixes = structuredClone(plan.approvedPrefixes ?? {});
    for (const amendment of amendments) {
        const changes = amendment.changes;
        const source = changes.approvedPrefixes;
        if (!source)
            continue;
        for (const [channel, modules] of Object.entries(source)) {
            prefixes[channel] = {
                ...(prefixes[channel] ?? {}),
                ...modules,
            };
        }
    }
    return prefixes;
}
export function createModulePlans(plan, amendments) {
    const prefixes = prefixState(plan, amendments);
    return plan.channelRuns.flatMap((channelRun) => channelRun.enabledModules.map((moduleName) => {
        const policy = getChannelModulePolicy(channelRun.channel, moduleName);
        const initial = prefixes[channelRun.channel]?.[moduleName] ?? [];
        let refinement = [];
        for (const amendment of amendments) {
            const refinementChange = amendment.changes.refinementPrefixes;
            const candidate = refinementChange?.[channelRun.channel]?.[moduleName];
            if (candidate)
                refinement = candidate;
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
    }));
}
//# sourceMappingURL=planner.js.map