import { dedicatedTargetPolicy, moduleProcedure, sharedPlaybookFields } from "./shared.js";
export const pinterestPlaybook = {
    ...sharedPlaybookFields(),
    channel: "pinterest",
    defaultAccess: "authenticated_preferred",
    publicCompletion: true,
    supportedBrowsers: { codex: ["chrome", "in_app"], claude: ["chrome"] },
    dedicatedTarget: dedicatedTargetPolicy("pinterest"),
    entryInstruction: "Open Pinterest native search; proceed on personal/public routes only when the semantic Search control is present, and classify Business Hub or root-after-search-redirect without it as ui_change.",
    semanticCheckpoints: [
        { id: "pinterest-channel", purpose: "channel", description: "Pinterest search/result identity is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "pinterest-search", purpose: "search", description: "A semantic Search control is visible on a personal or public search route.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "pinterest-results", purpose: "results", description: "Pins and result-type/refinement controls are visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "pinterest-empty", purpose: "empty", description: "A native empty state is explicitly visible.", evidenceStatus: "acceptance_gap", required: false, failureCode: "native_empty" },
    ],
    modules: {
        "search-term": moduleProcedure("pinterest", "search-term", {
            prefixSyntax: "ordinary topic phrase",
            acceptedCandidateKinds: ["native_phrase"],
            excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
            autocompleteEvidence: "official_only",
            caveat: "Official Help documents search-bar suggestions; current public desktop showed result refinements but no autocomplete dropdown. Business Hub or root-after-search-redirect without Search is ui_change, not challenge or native empty.",
            zeroPolicy: "Refinement chips are retained as auxiliary evidence, not silently substituted for autocomplete suggestions.",
        }),
        hashtag: moduleProcedure("pinterest", "hashtag", {
            prefixSyntax: "not applicable",
            acceptedCandidateKinds: [],
            excludedCandidateKinds: ["native_phrase", "native_hashtag", "account", "typed_entity", "search_action", "query_refinement"],
            autocompleteEvidence: "not_applicable",
            caveat: "Version 1 deliberately does not research Pinterest hashtags.",
            zeroPolicy: "Return not_applicable immediately without browser evidence.",
        }),
    },
    resultSample: {
        maxResultsPerCandidate: 3,
        visibleFields: ["Pin or product title", "accessible label", "result type", "visible price when present"],
        skipSponsored: true,
        engagementIsDescriptiveOnly: true,
    },
    acceptanceGaps: ["Authenticated personalization, Business Hub search entry, and a live autocomplete dropdown."],
    evidenceSources: ["https://help.pinterest.com/en/article/discover-ideas-on-pinterest"],
};
//# sourceMappingURL=pinterest.js.map