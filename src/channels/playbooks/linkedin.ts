import type { ChannelPlaybook } from "../types.js";
import { moduleProcedure, sharedPlaybookFields } from "./shared.js";

export const linkedinPlaybook: ChannelPlaybook = {
  ...sharedPlaybookFields(),
  channel: "linkedin",
  defaultAccess: "authenticated",
  publicCompletion: false,
  supportedBrowsers: { codex: ["chrome"], claude: ["chrome"] },
  entryInstruction: "Open LinkedIn native search in the signed-in Chrome session and locate the top search textbox.",
  semanticCheckpoints: [
    { id: "linkedin-channel", purpose: "channel", description: "LinkedIn navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "linkedin-auth", purpose: "access", description: "Authenticated LinkedIn navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "authentication_required" },
    { id: "linkedin-search", purpose: "search", description: "Top search textbox, currently labelled “I'm looking for…”, is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "linkedin-results", purpose: "results", description: "Native category/results region is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
  ],
  modules: {
    "search-term": moduleProcedure("linkedin", "search-term", {
      prefixSyntax: "keyword phrase or natural-language query",
      acceptedCandidateKinds: ["native_phrase"],
      excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
      autocompleteEvidence: "confirmed_live",
      caveat: "Preserve visible Product, Company, member, or other entity labels and exclude typed entities from phrase recommendations.",
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
  acceptanceGaps: [],
  evidenceSources: ["https://www.linkedin.com/help/linkedin/answer/a523136/searching-on-linkedin"],
};
