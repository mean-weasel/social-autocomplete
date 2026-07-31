import {
  CHANNELS,
  CONTRACT_VERSION,
  EVIDENCE_TIERS,
  MODULES,
  ORCHESTRATION_MODES,
  type Channel,
  type ContractIssue,
  ContractError,
  type EvidenceTier,
  isRecord,
  type JsonValue,
  type ModuleName,
  type OrchestrationMode,
  requireString,
} from "./common.js";

export interface CreativeBrief {
  summary: string;
  audience?: string;
  objective?: string;
  [key: string]: JsonValue | undefined;
}

export interface LocaleSpec {
  uiLocale: string;
  region: string;
  timezone: string;
}

export interface InteractionBounds {
  maxPrefixesPerModule: number;
  maxSuggestionsPerPrefix: number;
  maxResultsPerCandidate: number;
  maxRefinementRounds: 1;
}

export const RUN_BROWSERS = ["chrome", "in_app"] as const;
export type RunBrowser = (typeof RUN_BROWSERS)[number];
export const COMPLETED_RESEARCH_TABS = ["close", "keep_open"] as const;
export type CompletedResearchTabs = (typeof COMPLETED_RESEARCH_TABS)[number];

export interface BrowserSelection {
  browser: RunBrowser;
  confirmedByUser: true;
}

export interface PlanRequest {
  contractVersion: typeof CONTRACT_VERSION;
  runId?: string;
  creativeBrief: CreativeBrief;
  inputReferences: string[];
  channels: Channel[];
  locale: LocaleSpec;
  orchestrationMode: OrchestrationMode;
  enabledModules: ModuleName[];
  defaultEvidenceTier: EvidenceTier;
  browserSelection: BrowserSelection;
  completedResearchTabs?: CompletedResearchTabs;
  channelOverrides?: Partial<Record<Channel, { evidenceTier?: EvidenceTier }>>;
  approvedPrefixes?: Partial<Record<Channel, Partial<Record<ModuleName, string[]>>>>;
  interactionBounds: InteractionBounds;
}

export interface ChannelRunPlan {
  channelRunId: string;
  channel: Channel;
  enabledModules: ModuleName[];
  evidenceTier: EvidenceTier;
}

export interface StoredPlan extends PlanRequest {
  runId: string;
  createdAt: string;
  channelRuns: ChannelRunPlan[];
}

export interface PlanAmendment {
  contractVersion: typeof CONTRACT_VERSION;
  amendmentId: string;
  runId: string;
  createdAt: string;
  reason: string;
  changes: Record<string, JsonValue>;
}

export function effectiveBrowserSelection(
  plan: StoredPlan,
  amendments: PlanAmendment[],
): BrowserSelection {
  let selection = plan.browserSelection;
  for (const amendment of amendments) {
    const candidate = amendment.changes.browserSelection;
    if (isRecord(candidate)) selection = candidate as unknown as BrowserSelection;
  }
  return selection;
}

export function effectiveCompletedResearchTabs(plan: StoredPlan): CompletedResearchTabs {
  return plan.completedResearchTabs ?? "close";
}

function validateBrowserSelection(
  value: unknown,
  path: string,
  issues: ContractIssue[],
): value is BrowserSelection {
  if (!isRecord(value)) {
    issues.push({ code: "invalid_object", message: "Expected a browser selection object.", path });
    return false;
  }
  enumValue(value.browser, RUN_BROWSERS, `${path}.browser`, issues);
  if (value.confirmedByUser !== true) {
    issues.push({
      code: "browser_selection_not_confirmed",
      message: "The user must explicitly confirm Chrome or the Codex in-app Browser before planning.",
      path: `${path}.confirmedByUser`,
    });
  }
  return issues.every((issue) => !issue.path?.startsWith(path));
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ContractIssue[],
): value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issues.push({
      code: "invalid_enum",
      message: `Expected one of: ${allowed.join(", ")}.`,
      path,
    });
    return false;
  }
  return true;
}

export function parsePlanRequest(value: unknown): PlanRequest {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    throw new ContractError("Invalid plan request.", [
      { code: "invalid_object", message: "Expected a JSON object.", path: "$" },
    ]);
  }

  if (value.contractVersion !== CONTRACT_VERSION) {
    issues.push({
      code: "unsupported_contract_version",
      message: `Expected contractVersion ${CONTRACT_VERSION}.`,
      path: "$.contractVersion",
    });
  }
  if (!isRecord(value.creativeBrief)) {
    issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.creativeBrief" });
  } else {
    requireString(value.creativeBrief.summary, "$.creativeBrief.summary", issues);
  }
  if (!Array.isArray(value.inputReferences) || !value.inputReferences.every((item) => typeof item === "string")) {
    issues.push({
      code: "invalid_string_array",
      message: "Expected an array of safe input references.",
      path: "$.inputReferences",
    });
  }
  if (
    !Array.isArray(value.channels) ||
    value.channels.length === 0 ||
    !value.channels.every((item) => typeof item === "string" && CHANNELS.includes(item as Channel)) ||
    new Set(value.channels).size !== value.channels.length
  ) {
    issues.push({
      code: "invalid_channels",
      message: "Expected a non-empty ordered list of unique supported channels.",
      path: "$.channels",
    });
  }
  if (!isRecord(value.locale)) {
    issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.locale" });
  } else {
    requireString(value.locale.uiLocale, "$.locale.uiLocale", issues);
    requireString(value.locale.region, "$.locale.region", issues);
    requireString(value.locale.timezone, "$.locale.timezone", issues);
  }
  enumValue(value.orchestrationMode, ORCHESTRATION_MODES, "$.orchestrationMode", issues);
  if (
    !Array.isArray(value.enabledModules) ||
    value.enabledModules.length === 0 ||
    !value.enabledModules.every((item) => typeof item === "string" && MODULES.includes(item as ModuleName)) ||
    new Set(value.enabledModules).size !== value.enabledModules.length
  ) {
    issues.push({
      code: "invalid_modules",
      message: "Expected a non-empty list of unique supported modules.",
      path: "$.enabledModules",
    });
  }
  enumValue(value.defaultEvidenceTier, EVIDENCE_TIERS, "$.defaultEvidenceTier", issues);
  validateBrowserSelection(value.browserSelection, "$.browserSelection", issues);
  if (value.completedResearchTabs !== undefined) {
    enumValue(
      value.completedResearchTabs,
      COMPLETED_RESEARCH_TABS,
      "$.completedResearchTabs",
      issues,
    );
  }
  if (!isRecord(value.interactionBounds)) {
    issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.interactionBounds" });
  } else {
    for (const field of ["maxPrefixesPerModule", "maxSuggestionsPerPrefix", "maxResultsPerCandidate"] as const) {
      const bound = value.interactionBounds[field];
      if (!Number.isInteger(bound) || (bound as number) < 1) {
        issues.push({
          code: "invalid_bound",
          message: "Expected a positive integer.",
          path: `$.interactionBounds.${field}`,
        });
      }
    }
    if (value.interactionBounds.maxRefinementRounds !== 1) {
      issues.push({
        code: "invalid_refinement_bound",
        message: "Version 1 requires exactly one bounded refinement round.",
        path: "$.interactionBounds.maxRefinementRounds",
      });
    }
  }
  if (value.runId !== undefined && !/^run_[A-Za-z0-9_-]+$/.test(String(value.runId))) {
    issues.push({ code: "invalid_run_id", message: "Expected run_<id>.", path: "$.runId" });
  }
  if (issues.length > 0) {
    throw new ContractError("Invalid plan request.", issues);
  }
  return value as unknown as PlanRequest;
}

export function parsePlanAmendment(value: unknown, runId: string): Omit<PlanAmendment, "createdAt"> {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    throw new ContractError("Invalid plan amendment.", [
      { code: "invalid_object", message: "Expected a JSON object.", path: "$" },
    ], 2, runId);
  }
  if (value.contractVersion !== CONTRACT_VERSION) {
    issues.push({
      code: "unsupported_contract_version",
      message: `Expected contractVersion ${CONTRACT_VERSION}.`,
      path: "$.contractVersion",
    });
  }
  requireString(value.amendmentId, "$.amendmentId", issues);
  requireString(value.reason, "$.reason", issues);
  if (value.runId !== runId) {
    issues.push({ code: "run_id_mismatch", message: "Amendment runId does not match --run.", path: "$.runId" });
  }
  if (!isRecord(value.changes)) {
    issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.changes" });
  } else if (value.changes.browserSelection !== undefined) {
    validateBrowserSelection(
      value.changes.browserSelection,
      "$.changes.browserSelection",
      issues,
    );
  }
  if (issues.length > 0) {
    throw new ContractError("Invalid plan amendment.", issues, 2, runId);
  }
  return value as unknown as Omit<PlanAmendment, "createdAt">;
}
