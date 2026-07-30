import { dedicatedTargetPolicy, moduleProcedure, sharedPlaybookFields } from "./shared.js";
export const xPlaybook = {
    ...sharedPlaybookFields(),
    channel: "x",
    defaultAccess: "authenticated",
    publicCompletion: false,
    supportedBrowsers: { codex: ["chrome"], claude: ["chrome"] },
    dedicatedTarget: dedicatedTargetPolicy("x"),
    entryInstruction: "Open X search in the signed-in Chrome session and locate the Search query combobox.",
    semanticCheckpoints: [
        { id: "x-channel", purpose: "channel", description: "X primary navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "x-auth", purpose: "access", description: "Authenticated X navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "authentication_required" },
        { id: "x-search", purpose: "search", description: "Search query combobox is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
        { id: "x-results", purpose: "results", description: "Search timeline and result tabs are visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    ],
    modules: {
        "search-term": moduleProcedure("x", "search-term", {
            prefixSyntax: "ordinary phrase",
            acceptedCandidateKinds: ["native_phrase"],
            excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
            autocompleteEvidence: "confirmed_live",
            caveat: "Current suggestions included an exact Search action and accounts. Neither is a phrase recommendation.",
            zeroPolicy: "Return zero when bounded attempts yield only search actions/accounts and no exact native phrase suggestion.",
        }),
        hashtag: moduleProcedure("x", "hashtag", {
            prefixSyntax: "# plus an unspaced keyword",
            acceptedCandidateKinds: ["native_hashtag"],
            excludedCandidateKinds: ["native_phrase", "account", "typed_entity", "search_action", "query_refinement"],
            autocompleteEvidence: "acceptance_gap",
            caveat: "Hashtag search is official; hashtag-specific suggestions beyond the exact search action remain an acceptance gap.",
            zeroPolicy: "The exact Search action is navigation evidence, not candidate evidence; return zero if no native hashtag suggestion appears.",
        }),
    },
    resultSample: {
        maxResultsPerCandidate: 3,
        visibleFields: ["post excerpt", "account", "time", "replies", "reposts", "likes", "bookmarks", "views"],
        skipSponsored: true,
        engagementIsDescriptiveOnly: true,
    },
    acceptanceGaps: ["Hashtag-specific suggestion behavior beyond the exact search action."],
    evidenceSources: [
        "https://help.x.com/en/using-x/x-search",
        "https://help.x.com/en/using-x/how-to-use-hashtags",
    ],
};
//# sourceMappingURL=x.js.map