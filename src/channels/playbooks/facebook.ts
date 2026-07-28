import type { ChannelPlaybook } from "../types.js";
import { moduleProcedure, sharedPlaybookFields } from "./shared.js";

export const facebookPlaybook: ChannelPlaybook = {
  ...sharedPlaybookFields(),
  channel: "facebook",
  defaultAccess: "authenticated",
  publicCompletion: false,
  supportedBrowsers: { codex: ["chrome"], claude: ["chrome"] },
  entryInstruction: "Open Facebook native search in the user-controlled signed-in Chrome session.",
  semanticCheckpoints: [
    { id: "facebook-channel", purpose: "channel", description: "Facebook identity is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "facebook-auth", purpose: "access", description: "The surface is not the Facebook login page.", evidenceStatus: "confirmed_live", required: true, failureCode: "authentication_required" },
    { id: "facebook-search", purpose: "search", description: "A native Facebook search field is visible.", evidenceStatus: "official_only", required: true, failureCode: "ui_change" },
    { id: "facebook-results", purpose: "results", description: "Permission-scoped native result cards are visible after search.", evidenceStatus: "acceptance_gap", required: true, failureCode: "ui_change" },
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
  acceptanceGaps: ["Authenticated autocomplete and result-card fields require user-controlled Chrome acceptance."],
  evidenceSources: ["https://www.facebook.com/help/587836257914341"],
};
