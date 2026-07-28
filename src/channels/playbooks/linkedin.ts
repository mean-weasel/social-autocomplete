import type { ChannelPlaybook } from "../types.js";
import { moduleProcedure, sharedPlaybookFields } from "./shared.js";

export const linkedinPlaybook: ChannelPlaybook = {
  ...sharedPlaybookFields(),
  channel: "linkedin",
  defaultAccess: "authenticated",
  publicCompletion: false,
  supportedBrowsers: { codex: ["chrome"], claude: ["chrome"] },
  entryInstruction: "Open LinkedIn in the signed-in Chrome session and continue only when a semantic native search-entry control is present.",
  semanticCheckpoints: [
    { id: "linkedin-channel", purpose: "channel", description: "LinkedIn navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "linkedin-auth", purpose: "access", description: "Authenticated LinkedIn navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "authentication_required" },
    { id: "linkedin-search", purpose: "search", description: "A semantic native search-entry control is visible; authenticated Feed/navigation alone does not satisfy this checkpoint.", evidenceStatus: "acceptance_gap", required: true, failureCode: "ui_change" },
    { id: "linkedin-results", purpose: "results", description: "Native category/results region is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
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
  acceptanceGaps: ["A current authenticated Feed variant exposes navigation without an evidenced native search-entry control."],
  evidenceSources: ["https://www.linkedin.com/help/linkedin/answer/a523136/searching-on-linkedin"],
};
