import type { ChannelPlaybook } from "../types.js";
import { dedicatedTargetPolicy, moduleProcedure, sharedPlaybookFields } from "./shared.js";

export const facebookPlaybook: ChannelPlaybook = {
  ...sharedPlaybookFields(),
  channel: "facebook",
  defaultAccess: "authenticated",
  publicCompletion: false,
  supportedBrowsers: { codex: ["chrome"], claude: ["chrome"] },
  dedicatedTarget: dedicatedTargetPolicy("facebook"),
  entryInstruction: "Create a plugin-owned Facebook target at the typed official root in the user-controlled signed-in Chrome session. Project entry roles (searchbox, combobox, textbox) only through the closed exact accessible-name allowlist Search Facebook; project navigation roles (link, button) only through Search and Search Facebook. Query each role/name pair directly, require exactly one visible allowed match, and permit at most one evidenced in-origin activation plus one identical repeat. Proceed only on facebook_search with facebook_native_search_entry; a matched authenticated shell reports facebook_authenticated_navigation, while target_unavailable is reserved for an unmatched target.",
  semanticCheckpoints: [
    { id: "facebook-channel", purpose: "channel", description: "Facebook identity is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "facebook-auth", purpose: "access", description: "The surface is not the Facebook login page.", evidenceStatus: "confirmed_live", required: true, failureCode: "authentication_required" },
    { id: "facebook-search", purpose: "search", description: "The matched target is facebook_search and facebook_native_search_entry is structurally present. Authenticated navigation alone does not pass.", evidenceStatus: "acceptance_gap", required: true, failureCode: "ui_change" },
    { id: "facebook-results", purpose: "results", description: "Permission-scoped native results are required only after a query interaction begins.", evidenceStatus: "acceptance_gap", required: true, failureCode: "ui_change" },
  ],
  modules: {
    "search-term": moduleProcedure("facebook", "search-term", {
      prefixSyntax: "ordinary phrase",
      acceptedCandidateKinds: ["native_phrase"],
      excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
      autocompleteEvidence: "acceptance_gap",
      caveat: "Authenticated autocomplete remains a live acceptance gap.",
      zeroPolicy: "Only an explicit native empty state after bounded attempts may support zero.",
    }),
    hashtag: moduleProcedure("facebook", "hashtag", {
      prefixSyntax: "# plus an unspaced phrase",
      acceptedCandidateKinds: ["native_hashtag"],
      excludedCandidateKinds: ["native_phrase", "account", "typed_entity", "search_action", "query_refinement"],
      autocompleteEvidence: "official_only",
      caveat: "Official Help confirms hashtag search; authenticated autocomplete remains unverified.",
      zeroPolicy: "Attempt initial and one refinement round; return zero when no exact native hashtag suggestion is visible.",
    }),
  },
  resultSample: {
    maxResultsPerCandidate: 3,
    visibleFields: ["short post excerpt", "author or Page", "relative time", "native engagement labels when visible"],
    skipSponsored: true,
    engagementIsDescriptiveOnly: true,
  },
  acceptanceGaps: ["The explicit Facebook search-entry adapter, authenticated autocomplete, and result-card fields require fresh user-controlled Chrome acceptance."],
  evidenceSources: ["https://www.facebook.com/help/587836257914341"],
};
