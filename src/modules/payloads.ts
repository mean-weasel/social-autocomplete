import {
  type ContractIssue,
  ContractError,
  isRecord,
  type ModuleName,
  type Observation,
  requireString,
  requireStringArray,
} from "../contracts/index.js";
import {
  REJECTION_REASONS,
  type CandidateDecisionPayload,
  type ResultSamplePayload,
  type SuggestionSetPayload,
  ZERO_REASONS,
  type ZeroDecisionPayload,
} from "./types.js";

function parseSuggestionSet(
  moduleName: ModuleName,
  payload: unknown,
  runId: string,
): SuggestionSetPayload {
  const issues: ContractIssue[] = [];
  if (!isRecord(payload)) {
    throw new ContractError("Invalid suggestion_set payload.", [
      { code: "invalid_module_payload", message: "Expected an object.", path: "$.payload" },
    ], 2, runId);
  }
  if (!Array.isArray(payload.suggestions)) {
    issues.push({ code: "invalid_suggestions", message: "Expected a suggestions array.", path: "$.payload.suggestions" });
  } else {
    payload.suggestions.forEach((item, index) => {
      if (!isRecord(item)) {
        issues.push({ code: "invalid_suggestion", message: "Expected an object.", path: `$.payload.suggestions[${index}]` });
        return;
      }
      if (requireString(item.displayedValue, `$.payload.suggestions[${index}].displayedValue`, issues)) {
        if (moduleName === "hashtag" && !item.displayedValue.startsWith("#")) {
          issues.push({
            code: "invalid_hashtag",
            message: "Hashtag suggestions must preserve the displayed leading #.",
            path: `$.payload.suggestions[${index}].displayedValue`,
          });
        }
      }
      if (!Number.isInteger(item.displayPosition) || (item.displayPosition as number) < 1) {
        issues.push({
          code: "invalid_display_position",
          message: "Expected a positive integer; position is observational, not performance proof.",
          path: `$.payload.suggestions[${index}].displayPosition`,
        });
      }
    });
  }
  if (!["visible_list_exhausted", "bound_reached", "native_empty"].includes(String(payload.stoppingReason))) {
    issues.push({ code: "invalid_stopping_reason", message: "Unsupported stopping reason.", path: "$.payload.stoppingReason" });
  }
  if (payload.round !== undefined && payload.round !== 0 && payload.round !== 1) {
    issues.push({ code: "invalid_refinement_round", message: "round must be 0 or 1.", path: "$.payload.round" });
  }
  if (payload.stoppingReason === "native_empty" && Array.isArray(payload.suggestions) && payload.suggestions.length > 0) {
    issues.push({ code: "native_empty_with_suggestions", message: "native_empty cannot contain suggestions.", path: "$.payload" });
  }
  if (issues.length > 0) throw new ContractError("Invalid suggestion_set payload.", issues, 2, runId);
  return { ...(payload as unknown as SuggestionSetPayload), round: (payload.round ?? 0) as 0 | 1 };
}

function parseResultSample(payload: unknown, runId: string): ResultSamplePayload {
  const issues: ContractIssue[] = [];
  if (!isRecord(payload)) {
    throw new ContractError("Invalid result_sample payload.", [
      { code: "invalid_module_payload", message: "Expected an object.", path: "$.payload" },
    ], 2, runId);
  }
  requireString(payload.candidate, "$.payload.candidate", issues);
  if (!Array.isArray(payload.results) || payload.results.length > 3) {
    issues.push({ code: "invalid_result_count", message: "Expected at most three results.", path: "$.payload.results" });
  } else {
    const positions = new Set<number>();
    payload.results.forEach((result, index) => {
      if (!isRecord(result)) {
        issues.push({ code: "invalid_result", message: "Expected an object.", path: `$.payload.results[${index}]` });
        return;
      }
      if (!Number.isInteger(result.position) || (result.position as number) < 1 || positions.has(result.position as number)) {
        issues.push({ code: "invalid_result_position", message: "Expected a distinct positive position.", path: `$.payload.results[${index}].position` });
      } else positions.add(result.position as number);
      if (!["relevant", "mixed", "irrelevant"].includes(String(result.relevance))) {
        issues.push({ code: "invalid_relevance", message: "Unsupported relevance classification.", path: `$.payload.results[${index}].relevance` });
      }
      requireString(result.relevanceRationale, `$.payload.results[${index}].relevanceRationale`, issues);
    });
  }
  if (typeof payload.surfaceExhausted !== "boolean" || typeof payload.noResults !== "boolean") {
    issues.push({ code: "invalid_result_state", message: "surfaceExhausted and noResults must be booleans.", path: "$.payload" });
  }
  if (payload.noResults === true && Array.isArray(payload.results) && payload.results.length > 0) {
    issues.push({ code: "no_results_with_results", message: "noResults cannot include results.", path: "$.payload" });
  }
  if (!["result_bound_reached", "surface_exhausted", "native_no_results"].includes(String(payload.stoppingReason))) {
    issues.push({ code: "invalid_stopping_reason", message: "Unsupported stopping reason.", path: "$.payload.stoppingReason" });
  }
  if (issues.length > 0) throw new ContractError("Invalid result_sample payload.", issues, 2, runId);
  return payload as unknown as ResultSamplePayload;
}

function parseDecision(
  moduleName: ModuleName,
  payload: unknown,
  runId: string,
): CandidateDecisionPayload | ZeroDecisionPayload {
  const issues: ContractIssue[] = [];
  if (!isRecord(payload)) {
    throw new ContractError("Invalid recommendation_decision payload.", [
      { code: "invalid_module_payload", message: "Expected an object.", path: "$.payload" },
    ], 2, runId);
  }
  if (payload.decision === "zero") {
    if (!ZERO_REASONS.includes(payload.zeroReason as never)) {
      issues.push({ code: "invalid_zero_reason", message: "Unsupported zero reason.", path: "$.payload.zeroReason" });
    }
    requireString(payload.rationale, "$.payload.rationale", issues);
    requireStringArray(payload.suggestionEvidenceIds, "$.payload.suggestionEvidenceIds", issues);
  } else {
    if (payload.decision !== "selected" && payload.decision !== "rejected") {
      issues.push({ code: "invalid_decision", message: "Expected selected, rejected, or zero.", path: "$.payload.decision" });
    }
    if (requireString(payload.candidate, "$.payload.candidate", issues)) {
      if (moduleName === "hashtag" && !payload.candidate.startsWith("#")) {
        issues.push({ code: "invalid_hashtag", message: "Hashtag decisions must preserve the displayed leading #.", path: "$.payload.candidate" });
      }
    }
    requireString(payload.rationale, "$.payload.rationale", issues);
    requireStringArray(payload.suggestionEvidenceIds, "$.payload.suggestionEvidenceIds", issues);
    requireStringArray(payload.resultEvidenceIds, "$.payload.resultEvidenceIds", issues);
    if (payload.decision === "rejected" && !REJECTION_REASONS.includes(payload.reasonCode as never)) {
      issues.push({ code: "missing_rejection_reason", message: "Rejected candidates require an approved reason code.", path: "$.payload.reasonCode" });
    }
    if (payload.decision === "selected" && payload.reasonCode !== undefined) {
      issues.push({ code: "unexpected_rejection_reason", message: "Selected candidates cannot have a rejection reason.", path: "$.payload.reasonCode" });
    }
    if (payload.origin !== undefined && payload.origin !== "native" && payload.origin !== "model") {
      issues.push({ code: "invalid_origin", message: "origin must be native or model.", path: "$.payload.origin" });
    }
  }
  if (issues.length > 0) throw new ContractError("Invalid recommendation_decision payload.", issues, 2, runId);
  return payload as unknown as CandidateDecisionPayload | ZeroDecisionPayload;
}

export function parseModuleObservationPayload(observation: Observation): void {
  if (observation.module.name !== "search-term" && observation.module.name !== "hashtag") return;
  const moduleName = observation.module.name;
  if (observation.module.schemaVersion !== "1.0") {
    throw new ContractError("Unsupported module schema.", [
      { code: "unsupported_module_schema", message: "Version 1 modules require schemaVersion 1.0.", path: "$.module.schemaVersion" },
    ], 2, observation.runId);
  }
  if (observation.kind === "suggestion_set") {
    parseSuggestionSet(moduleName, observation.payload, observation.runId);
  } else if (observation.kind === "result_sample") {
    parseResultSample(observation.payload, observation.runId);
  } else if (observation.kind === "recommendation_decision") {
    parseDecision(moduleName, observation.payload, observation.runId);
  }
}
