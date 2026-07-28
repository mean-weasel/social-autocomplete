import {
  CHANNELS,
  CONTRACT_VERSION,
  type Channel,
  type ContractIssue,
  ContractError,
  isIsoTimestamp,
  isRecord,
  type JsonValue,
  requireString,
} from "./common.js";

export const OBSERVATION_KINDS = [
  "session_state",
  "suggestion_set",
  "result_sample",
  "recommendation_decision",
  "interruption",
  "diagnostic",
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export interface Observation {
  contractVersion: typeof CONTRACT_VERSION;
  observationId: string;
  runId: string;
  channelRunId: string;
  capturedAt: string;
  source: {
    kind: "browser_ui" | "provider_api";
    channel: Channel;
    browser: string;
    accessMode: "authenticated" | "public";
    uiLocale: string;
    region: string;
    timezone: string;
    personalizedSession: boolean;
    surface: string;
  };
  module: {
    name: string;
    schemaVersion: string;
  };
  kind: ObservationKind;
  query?: {
    topic?: string;
    intent?: string;
    typedText?: string;
  };
  payload: JsonValue;
}

export function parseObservation(value: unknown, expectedRunId: string): Observation {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    throw new ContractError("Invalid observation.", [
      { code: "invalid_object", message: "Expected a JSON object.", path: "$" },
    ], 2, expectedRunId);
  }
  if (value.contractVersion !== CONTRACT_VERSION) {
    issues.push({
      code: "unsupported_contract_version",
      message: `Expected contractVersion ${CONTRACT_VERSION}.`,
      path: "$.contractVersion",
    });
  }
  requireString(value.observationId, "$.observationId", issues);
  if (value.runId !== expectedRunId) {
    issues.push({ code: "run_id_mismatch", message: "Observation runId does not match --run.", path: "$.runId" });
  }
  requireString(value.channelRunId, "$.channelRunId", issues);
  if (!requireString(value.capturedAt, "$.capturedAt", issues) || !isIsoTimestamp(value.capturedAt)) {
    issues.push({
      code: "invalid_timestamp",
      message: "capturedAt must be an ISO 8601 timestamp with an offset or Z.",
      path: "$.capturedAt",
    });
  }
  if (!isRecord(value.source)) {
    issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.source" });
  } else {
    if (value.source.kind !== "browser_ui" && value.source.kind !== "provider_api") {
      issues.push({ code: "invalid_source_kind", message: "Unsupported source kind.", path: "$.source.kind" });
    }
    if (typeof value.source.channel !== "string" || !CHANNELS.includes(value.source.channel as Channel)) {
      issues.push({ code: "invalid_channel", message: "Unsupported channel.", path: "$.source.channel" });
    }
    for (const field of ["browser", "uiLocale", "region", "timezone", "surface"] as const) {
      requireString(value.source[field], `$.source.${field}`, issues);
    }
    if (value.source.accessMode !== "authenticated" && value.source.accessMode !== "public") {
      issues.push({ code: "invalid_access_mode", message: "Unsupported access mode.", path: "$.source.accessMode" });
    }
    if (typeof value.source.personalizedSession !== "boolean") {
      issues.push({ code: "invalid_boolean", message: "Expected a boolean.", path: "$.source.personalizedSession" });
    }
  }
  if (!isRecord(value.module)) {
    issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.module" });
  } else {
    requireString(value.module.name, "$.module.name", issues);
    requireString(value.module.schemaVersion, "$.module.schemaVersion", issues);
  }
  if (typeof value.kind !== "string" || !OBSERVATION_KINDS.includes(value.kind as ObservationKind)) {
    issues.push({ code: "invalid_observation_kind", message: "Unsupported observation kind.", path: "$.kind" });
  }
  if (value.payload === undefined) {
    issues.push({ code: "missing_payload", message: "payload is required.", path: "$.payload" });
  }
  if (issues.length > 0) {
    throw new ContractError("Invalid observation.", issues, 2, expectedRunId);
  }
  return value as unknown as Observation;
}
