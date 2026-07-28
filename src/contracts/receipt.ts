import type { ContractIssue, EvidenceTier, JsonValue, ModuleName } from "./common.js";
import { CONTRACT_VERSION, type Channel } from "./common.js";

export interface CoreReceipt {
  contractVersion: typeof CONTRACT_VERSION;
  receiptVersion: "1.0";
  receiptId: string;
  runId: string;
  channelRunId: string;
  planDigest: string;
  amendmentReferences: string[];
  channel: Channel;
  enabledModules: ModuleName[];
  createdAt: string;
  capturedAt: { first: string; last: string };
  validatedAt: string;
  requestedLocale: { uiLocale: string; region: string; timezone: string };
  observedLocale: { uiLocale: string; region: string; timezone: string };
  browser: string;
  accessMode: "authenticated" | "public";
  personalizedSession: boolean;
  evidenceTier: EvidenceTier;
  observationReferences: string[];
  status: "complete";
  warnings: ContractIssue[];
  failures: ContractIssue[];
  moduleResults: Record<string, JsonValue>;
}
