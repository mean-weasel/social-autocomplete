import type { ChannelPlaybook } from "../types.js";
import { moduleProcedure, sharedPlaybookFields } from "./shared.js";

export const instagramPlaybook: ChannelPlaybook = {
  ...sharedPlaybookFields(),
  channel: "instagram",
  defaultAccess: "authenticated",
  publicCompletion: false,
  supportedBrowsers: { codex: ["chrome"], claude: ["chrome"] },
  entryInstruction: "Open Instagram Search & Explore in the user-controlled signed-in Chrome session.",
  semanticCheckpoints: [
    { id: "instagram-channel", purpose: "channel", description: "Instagram identity is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "instagram-auth", purpose: "access", description: "The surface is not the Instagram login page.", evidenceStatus: "confirmed_live", required: true, failureCode: "authentication_required" },
    { id: "instagram-search", purpose: "search", description: "Search & Explore search is visible.", evidenceStatus: "official_only", required: true, failureCode: "ui_change" },
    { id: "instagram-results", purpose: "results", description: "Native account, hashtag, audio, tag, place, or content results are visible.", evidenceStatus: "acceptance_gap", required: true, failureCode: "ui_change" },
  ],
  modules: {
    "search-term": moduleProcedure("instagram", "search-term", {
      prefixSyntax: "ordinary phrase",
      acceptedCandidateKinds: ["native_phrase"],
      excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
      autocompleteEvidence: "acceptance_gap",
      caveat: "Search is personalized and authenticated autocomplete remains a live acceptance gap.",
      zeroPolicy: "Only explicit native empty evidence after bounded attempts may support zero.",
    }),
    hashtag: moduleProcedure("instagram", "hashtag", {
      prefixSyntax: "# plus an unspaced phrase",
      acceptedCandidateKinds: ["native_hashtag"],
      excludedCandidateKinds: ["native_phrase", "account", "typed_entity", "search_action", "query_refinement"],
      autocompleteEvidence: "official_only",
      caveat: "Restricted hashtags may be unsearchable and must be rejected with a native reason.",
      zeroPolicy: "Attempt initial and one refinement round; preserve restricted/no-results states separately from authentication or UI failure.",
    }),
  },
  resultSample: {
    maxResultsPerCandidate: 3,
    visibleFields: ["short caption summary", "account", "content type", "relative time", "native engagement labels when visible"],
    skipSponsored: true,
    engagementIsDescriptiveOnly: true,
  },
  acceptanceGaps: ["Authenticated autocomplete, hashtag restrictions, and result-card fields require user-controlled Chrome acceptance."],
  evidenceSources: [
    "https://www.facebook.com/help/instagram/search/?query=hashtags",
    "https://www.facebook.com/help/487224561296752",
  ],
};
