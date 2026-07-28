import type { ChannelPlaybook } from "../types.js";
import { moduleProcedure, sharedPlaybookFields } from "./shared.js";

export const youtubePlaybook: ChannelPlaybook = {
  ...sharedPlaybookFields(),
  channel: "youtube",
  defaultAccess: "authenticated_preferred",
  publicCompletion: true,
  supportedBrowsers: { codex: ["chrome", "in_app"], claude: ["chrome"] },
  entryInstruction: "Open YouTube search; prefer signed-in Chrome and use the in-app Browser for permitted public research.",
  semanticCheckpoints: [
    { id: "youtube-channel", purpose: "channel", description: "YouTube banner/navigation is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "youtube-search", purpose: "search", description: "Expanded Search combobox is visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
    { id: "youtube-results", purpose: "results", description: "Native result filters and video cards are visible.", evidenceStatus: "confirmed_live", required: true, failureCode: "ui_change" },
  ],
  modules: {
    "search-term": moduleProcedure("youtube", "search-term", {
      prefixSyntax: "ordinary phrase",
      acceptedCandidateKinds: ["native_phrase"],
      excludedCandidateKinds: ["account", "typed_entity", "search_action", "query_refinement", "native_hashtag"],
      autocompleteEvidence: "confirmed_live",
      zeroPolicy: "Only a successfully opened, explicit empty suggestion state after bounded attempts may support zero.",
    }),
    hashtag: moduleProcedure("youtube", "hashtag", {
      prefixSyntax: "# plus an unspaced phrase",
      acceptedCandidateKinds: ["native_hashtag"],
      excludedCandidateKinds: ["native_phrase", "account", "typed_entity", "search_action", "query_refinement"],
      autocompleteEvidence: "confirmed_live",
      zeroPolicy: "Only a successfully opened, explicit empty suggestion state after bounded attempts may support zero.",
    }),
  },
  resultSample: {
    maxResultsPerCandidate: 3,
    visibleFields: ["video title", "channel", "views", "age", "short description when visible"],
    skipSponsored: true,
    engagementIsDescriptiveOnly: true,
  },
  acceptanceGaps: [],
  evidenceSources: [
    "https://support.google.com/youtube/answer/16090438",
    "https://support.google.com/youtube/answer/10806146",
  ],
};
