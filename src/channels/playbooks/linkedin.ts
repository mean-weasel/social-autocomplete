import type { ChannelPlaybook } from "../types.js";
import { dedicatedTargetPolicy, moduleProcedure, sharedPlaybookFields } from "./shared.js";

export const linkedinPlaybook: ChannelPlaybook = {
  ...sharedPlaybookFields(),
  channel: "linkedin",
  defaultAccess: "authenticated",
  publicCompletion: false,
  supportedBrowsers: { codex: ["chrome"], claude: ["chrome"] },
  dedicatedTarget: dedicatedTargetPolicy("linkedin"),
  entryInstruction: "Create a plugin-owned LinkedIn target at the typed official root in the signed-in Chrome session. Project entry roles (searchbox, combobox, textbox) only through the closed exact accessible-name allowlist Search and Search by title, skill, or company; project navigation roles (link, button) only through Search and Click to start a search. Query each role/name pair directly, require exactly one visible allowed match, and permit at most one evidenced in-origin activation plus one identical repeat. Proceed only on linkedin_search with linkedin_native_search_entry; a matched authenticated Feed reports linkedin_authenticated_feed_navigation, while target_unavailable is reserved for an unmatched target.",
  semanticCheckpoints: [
    { id: "linkedin-channel", purpose: "channel", description: "LinkedIn navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "linkedin-auth", purpose: "access", description: "Authenticated LinkedIn navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "authentication_required" },
    { id: "linkedin-search", purpose: "search", description: "A semantic native search-entry control is visible; authenticated Feed/navigation alone does not satisfy this checkpoint.", evidenceStatus: "acceptance_gap", required: true, failureCode: "ui_change" },
    { id: "linkedin-results", purpose: "results", description: "A native category/results region is required only after a query interaction begins.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
  ],
  modules: {
    "search-term": moduleProcedure("linkedin", "search-term", {
      prefixSyntax: "keyword phrase or natural-language query",
      acceptedCandidateKinds: ["native_phrase"],
      excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
      autocompleteEvidence: "acceptance_gap",
      caveat: "The current authenticated Feed variant did not expose a semantic search entry. Preserve visible Product, Company, member, or other entity labels and exclude typed entities from phrase recommendations only after the entry checkpoint passes.",
      zeroPolicy: "Only explicit native empty evidence after bounded phrase attempts may support zero.",
    }),
    hashtag: moduleProcedure("linkedin", "hashtag", {
      prefixSyntax: "# plus an unspaced phrase",
      acceptedCandidateKinds: ["native_hashtag"],
      excludedCandidateKinds: ["native_phrase", "account", "typed_entity", "search_action", "query_refinement"],
      autocompleteEvidence: "official_only",
      caveat: "Current official Help says suggested searches do not suggest hashtags; live # input produced non-hashtag suggestions.",
      zeroPolicy: "Perform bounded initial/refinement attempts and return justified zero when no exact native hashtag suggestion exists.",
    }),
  },
  resultSample: {
    maxResultsPerCandidate: 3,
    visibleFields: ["post excerpt", "author or organization", "relative time", "reactions", "comments", "reposts", "poll votes when present"],
    skipSponsored: true,
    engagementIsDescriptiveOnly: true,
  },
  acceptanceGaps: ["A current authenticated Feed variant exposes navigation without an evidenced native search-entry control; the explicit adapter requires fresh Chrome acceptance."],
  evidenceSources: ["https://www.linkedin.com/help/linkedin/answer/a523136/searching-on-linkedin"],
};
