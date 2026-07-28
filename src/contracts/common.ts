export const CONTRACT_VERSION = "1.0" as const;

export const CHANNELS = [
  "facebook",
  "instagram",
  "linkedin",
  "x",
  "tiktok",
  "youtube",
  "pinterest",
] as const;

export const MODULES = ["search-term", "hashtag"] as const;
export const EVIDENCE_TIERS = ["autocomplete_only", "results_sample"] as const;
export const ORCHESTRATION_MODES = ["guided", "automatic"] as const;

export type Channel = (typeof CHANNELS)[number];
export type ModuleName = (typeof MODULES)[number];
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];
export type OrchestrationMode = (typeof ORCHESTRATION_MODES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ContractIssue {
  code: string;
  message: string;
  path?: string;
}

export interface OutputEnvelope<T extends JsonValue = JsonValue> {
  contractVersion: typeof CONTRACT_VERSION;
  command: "plan" | "record-observation" | "validate" | "unknown";
  ok: boolean;
  runId?: string;
  data: T | null;
  warnings: ContractIssue[];
  errors: ContractIssue[];
}

export class ContractError extends Error {
  readonly issues: ContractIssue[];
  readonly exitCode: number;
  readonly runId: string | undefined;

  constructor(
    message: string,
    issues: ContractIssue[],
    exitCode = 2,
    runId?: string,
  ) {
    super(message);
    this.name = "ContractError";
    this.issues = issues;
    this.exitCode = exitCode;
    this.runId = runId;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireString(
  value: unknown,
  path: string,
  issues: ContractIssue[],
): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ code: "invalid_string", message: "Expected a non-empty string.", path });
    return false;
  }
  return true;
}

export function requireStringArray(
  value: unknown,
  path: string,
  issues: ContractIssue[],
): value is string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    issues.push({ code: "invalid_string_array", message: "Expected an array of strings.", path });
    return false;
  }
  return true;
}

export function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

export function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}
