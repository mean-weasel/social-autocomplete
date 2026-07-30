import { dedicatedTargetPolicy, moduleProcedure, sharedPlaybookFields } from "./shared.js";
export const tiktokPlaybook = {
    ...sharedPlaybookFields(),
    channel: "tiktok",
    defaultAccess: "authenticated_preferred",
    publicCompletion: true,
    supportedBrowsers: { codex: ["chrome", "in_app"], claude: ["chrome"] },
    dedicatedTarget: dedicatedTargetPolicy("tiktok"),
    entryInstruction: "Open TikTok native search; prefer signed-in Chrome and permit public completion only while native search remains available.",
    semanticCheckpoints: [
        { id: "tiktok-channel", purpose: "channel", description: "TikTok identity/navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "tiktok-search", purpose: "search", description: "Search control labelled Search is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "tiktok-results", purpose: "results", description: "Top, Users, Videos, LIVE, or Photo result controls and cards are visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "tiktok-empty", purpose: "empty", description: "A native no-results/empty state is explicitly visible.", evidenceStatus: "acceptance_gap", required: false, failureCode: "native_empty" },
    ],
    modules: {
        "search-term": moduleProcedure("tiktok", "search-term", {
            prefixSyntax: "ordinary phrase",
            acceptedCandidateKinds: ["native_phrase"],
            excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
            autocompleteEvidence: "acceptance_gap",
            caveat: "The search control was visible but dropdown interaction was not reliable in the evidence pass.",
            zeroPolicy: "A failed interaction or missing locator is ui_change, never native empty.",
        }),
        hashtag: moduleProcedure("tiktok", "hashtag", {
            prefixSyntax: "# plus an unspaced phrase",
            acceptedCandidateKinds: ["native_hashtag"],
            excludedCandidateKinds: ["native_phrase", "account", "typed_entity", "search_action", "query_refinement"],
            autocompleteEvidence: "acceptance_gap",
            caveat: "Hashtags are visible in search results; autocomplete remains a live acceptance gap.",
            zeroPolicy: "A failed interaction or missing locator is ui_change; only explicit native empty evidence can support zero.",
        }),
    },
    resultSample: {
        maxResultsPerCandidate: 3,
        visibleFields: ["caption summary", "creator", "date", "visible hashtags", "native-labelled card metrics only"],
        skipSponsored: true,
        engagementIsDescriptiveOnly: true,
    },
    acceptanceGaps: ["Autocomplete capture and the label for the visible result-card count."],
    evidenceSources: [
        "https://support.tiktok.com/en/using-tiktok/exploring-videos/discover-and-search",
        "https://support.tiktok.com/en/using-tiktok/growing-your-audience/creator-search-insights",
    ],
};
//# sourceMappingURL=tiktok.js.map