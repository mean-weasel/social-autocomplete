import type {
  ContractIssue,
  EvidenceTier,
  JsonValue,
  ModuleName,
  Observation,
} from "../contracts/index.js";
import type { RecommendationRange } from "../channels/policies/index.js";

export interface SuggestionItem {
  displayedValue: string;
  displayPosition: number;
  nativeTypeLabel?: string;
  auxiliaryText?: string;
}

export interface SuggestionSetPayload {
  suggestions: SuggestionItem[];
  stoppingReason: "visible_list_exhausted" | "bound_reached" | "native_empty";
  round: 0 | 1;
}

export interface VisibleEngagement {
  label: string;
  value: string;
}

export interface ResultItem {
  position: number;
  excerpt?: string;
  summary?: string;
  relevance: "relevant" | "mixed" | "irrelevant";
  relevanceRationale: string;
  visibleEngagement?: VisibleEngagement[];
}

export interface ResultSamplePayload {
  candidate: string;
  results: ResultItem[];
  surfaceExhausted: boolean;
  noResults: boolean;
  stoppingReason: "result_bound_reached" | "surface_exhausted" | "native_no_results";
}

export const REJECTION_REASONS = [
  "not_relevant_to_brief",
  "too_broad",
  "too_narrow",
  "ambiguous_intent",
  "insufficient_result_relevance",
  "duplicate_candidate",
  "outside_recommendation_range",
] as const;

export const ZERO_REASONS = [
  "no_native_candidates",
  "candidates_not_relevant",
  "insufficient_result_relevance",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];
export type ZeroReason = (typeof ZERO_REASONS)[number];

export interface CandidateDecisionPayload {
  decision: "selected" | "rejected";
  candidate: string;
  rationale: string;
  suggestionEvidenceIds: string[];
  resultEvidenceIds: string[];
  reasonCode?: RejectionReason;
  seedProvenance?: JsonValue;
  origin?: "native" | "model";
}

export interface ZeroDecisionPayload {
  decision: "zero";
  zeroReason: ZeroReason;
  rationale: string;
  suggestionEvidenceIds: string[];
}

export interface ResearchedRecommendation {
  displayedValue: string;
  canonicalValue: string;
  rationale: string;
  suggestionEvidenceIds: string[];
  resultEvidenceIds: string[];
  seedProvenance?: JsonValue;
}

export interface RejectedCandidate extends ResearchedRecommendation {
  reasonCode: RejectionReason;
}

export interface ModelSuggestion {
  displayedValue: string;
  rationale: string;
}

export type ModuleOutcome = "recommended" | "zero" | "not_applicable" | "interrupted" | "failed";

export interface ModuleResult {
  module: ModuleName;
  schemaVersion: "1.0";
  outcome: ModuleOutcome;
  evidenceTier: EvidenceTier;
  recommendationRange: RecommendationRange | null;
  attemptedPrefixes: Array<{
    typedText: string;
    round: 0 | 1;
    observationId: string;
  }>;
  researchedRecommendations: ResearchedRecommendation[];
  rejectedCandidates: RejectedCandidate[];
  modelSuggestions: ModelSuggestion[];
  zeroReason?: ZeroReason;
  notApplicableReason?: string;
  evidenceReferences: string[];
  warnings: ContractIssue[];
  failures: ContractIssue[];
}

export interface ModuleReductionInput {
  moduleName: ModuleName;
  evidenceTier: EvidenceTier;
  observations: Observation[];
  plannedPrefixes: { initial: string[]; refinement: string[] };
  recommendationRange: RecommendationRange | null;
  bounds: {
    maxInitialPrefixes: number;
    maxRevisedPrefixes: number;
    maxSuggestionsPerPrefix: number;
    maxResultsPerCandidate: number;
    maxRefinementRounds: 1;
    freshnessHours: 24;
  };
  supported: boolean;
  notApplicableReason?: string;
  validatedAt: string;
}
