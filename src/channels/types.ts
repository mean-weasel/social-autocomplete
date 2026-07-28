import type {
  Channel,
  EvidenceTier,
  ModuleName,
  ObservationKind,
} from "../contracts/index.js";
import type { RecommendationRange } from "./policies/index.js";

export type BrowserHost = "codex" | "claude";
export type BrowserSurface = "chrome" | "in_app";
export type AccessMode = "authenticated" | "public";
export type PlaybookEvidenceStatus = "confirmed_live" | "official_only" | "acceptance_gap";
export type SurfaceRouteClass =
  | "generic"
  | "linkedin_search"
  | "linkedin_authenticated_feed"
  | "pinterest_public_search"
  | "pinterest_personal_search"
  | "pinterest_business_hub"
  | "pinterest_root_after_search_redirect";
export type SurfaceExpectedLandmark =
  | "required_landmarks"
  | "linkedin_native_search_entry"
  | "pinterest_search_control";
export type SurfaceObservedLandmark =
  | "required_landmarks"
  | "linkedin_native_search_entry"
  | "linkedin_authenticated_feed_navigation"
  | "pinterest_search_control"
  | "pinterest_business_hub"
  | "pinterest_root"
  | "landmark_missing";
export type CandidateKind =
  | "native_phrase"
  | "native_hashtag"
  | "typed_entity"
  | "account"
  | "search_action"
  | "query_refinement";

export interface SemanticCheckpoint {
  id: string;
  purpose: "channel" | "search" | "access" | "results" | "empty";
  description: string;
  evidenceStatus: PlaybookEvidenceStatus;
  required: boolean;
  failureCode: "authentication_required" | "ui_change" | "native_empty";
}

export interface PlaybookStep {
  id: string;
  instruction: string;
  emits: ObservationKind | null;
  bound: string;
}

export interface ModuleProcedure {
  module: ModuleName;
  support: "supported" | "not_applicable";
  recommendationRange: RecommendationRange | null;
  prefixSyntax: string;
  acceptedCandidateKinds: CandidateKind[];
  excludedCandidateKinds: CandidateKind[];
  autocompleteEvidence: PlaybookEvidenceStatus | "not_applicable";
  caveat?: string;
  zeroPolicy: string;
}

export interface ChannelPlaybook {
  contractVersion: "1.0";
  playbookVersion: "1.0";
  channel: Channel;
  evidenceDate: string;
  defaultAccess: "authenticated" | "authenticated_preferred";
  publicCompletion: boolean;
  supportedBrowsers: {
    codex: BrowserSurface[];
    claude: BrowserSurface[];
  };
  entryInstruction: string;
  prohibitedActions: string[];
  semanticCheckpoints: SemanticCheckpoint[];
  steps: PlaybookStep[];
  modules: Record<ModuleName, ModuleProcedure>;
  resultSample: {
    maxResultsPerCandidate: 3;
    visibleFields: string[];
    skipSponsored: boolean;
    engagementIsDescriptiveOnly: true;
  };
  interruptions: {
    authentication: string;
    challenge: string;
    localeMismatch: string;
    uiChange: string;
    assistedResume: string;
  };
  acceptanceGaps: string[];
  evidenceSources: string[];
}

export interface RouteRequest {
  channel: Channel;
  module: ModuleName;
  evidenceTier: EvidenceTier;
  host: BrowserHost;
  browser: BrowserSurface;
  accessMode: AccessMode;
}

export interface RouteDecision {
  contractVersion: "1.0";
  channel: Channel;
  module: ModuleName;
  playbookVersion: "1.0";
  status: "ready" | "not_applicable" | "interrupted" | "failed";
  playbook: ChannelPlaybook;
  reasonCode?: string;
  instruction?: string;
}

export interface SurfaceSnapshot {
  accessState: "ready" | "authentication_required" | "challenge";
  localeMatches: boolean;
  expectedLandmarksPresent: boolean;
  searchEntryPresent?: boolean;
  interactionAttempted: boolean;
  interactionSucceeded: boolean;
  explicitNativeEmpty: boolean;
  assistedResumeDiagnostic?: boolean;
  diagnostic?: {
    routeClass: SurfaceRouteClass;
    expectedLandmark: SurfaceExpectedLandmark;
    observedLandmark: SurfaceObservedLandmark;
  };
}

export interface SurfaceClassification {
  state: "ready" | "native_empty" | "interrupted" | "failed";
  reasonCode?: "authentication_required" | "challenge" | "locale_mismatch" | "ui_change";
  exitCode: 0 | 4 | 5 | 6;
  diagnostic?: SurfaceSnapshot["diagnostic"];
}
