#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  link,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const QA_CAMPAIGN_SCHEMA_VERSION = "qa-manager-campaign-state/v1";
export const QA_CAMPAIGN_CHILD_LIMIT = 10;
export const QA_CAMPAIGN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const QA_CAMPAIGN_SCOPE = Object.freeze({
  purpose: "qa_only",
  browser: "chrome",
  browserSurface: "existing_visible_chrome",
  orderedChannels: ["instagram", "facebook", "linkedin"],
  modules: ["hashtag", "search-term"],
  evidenceTier: "autocomplete_only",
  targetAcquisition: "new_agent_tab",
  targetOwnership: "plugin_owned",
  childLimit: QA_CAMPAIGN_CHILD_LIMIT,
});
const RECEIPT_CHANNELS = new Set(QA_CAMPAIGN_SCOPE.orderedChannels);

const CAMPAIGN_STATUSES = new Set([
  "pending",
  "active",
  "suspended",
  "revoked",
  "expired",
  "completed",
]);
const TERMINAL_DISPOSITIONS = new Set([
  "pass",
  "pass_with_findings",
  "blocked",
  "fail",
]);
const TERMINAL_FINDINGS = new Set([
  "authentication_required",
  "browser_binding_unavailable",
  "browser_action_timeout",
  "native_search_entry_missing",
  "target_unavailable",
  "terminal_ambiguity",
  "ui_change",
  "worker_host_unavailable",
]);
const PIN_FIELDS = [
  "productCommit",
  "productTree",
  "qaCommit",
  "qaTree",
  "scenarioSha256",
  "oracleSha256",
  "protocolSha256",
  "runReducerSha256",
  "campaignReducerSha256",
  "scenarioSchemaSha256",
];
const AUTHORIZATION_MACHINERY_FIELDS = [
  "protocolSha256",
  "runReducerSha256",
  "campaignReducerSha256",
  "scenarioSchemaSha256",
];
const MUTATION_CLAIM_WAIT_MS = 2_000;
const MUTATION_CLAIM_RETRY_MS = 5;

function clone(value) {
  return structuredClone(value);
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function qaCampaignPathSha256(path) {
  return sha256(resolve(path));
}

function requireHash(value, label) {
  invariant(
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    `${label} must be a SHA-256 hash`,
  );
}

function requireGitObject(value, label) {
  invariant(
    typeof value === "string" && /^[a-f0-9]{40,64}$/.test(value),
    `${label} must be an immutable Git object ID`,
  );
}

function requireStableId(value, label) {
  invariant(
    typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value),
    `${label} must be a stable sanitized ID`,
  );
}

function requireTimestamp(value, label) {
  invariant(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    `${label} must be an ISO-8601 UTC timestamp`,
  );
}

function requireTrustedOperationTime(value, label) {
  requireTimestamp(value, label);
  invariant(
    Date.parse(value) <= Date.now(),
    `${label} must not be in the future of the trusted wall clock`,
  );
}

function requireLifecycleTime(value, label, { after, before } = {}) {
  requireTrustedOperationTime(value, label);
  if (after !== undefined && after !== null) {
    invariant(Date.parse(value) >= Date.parse(after), `${label} predates lifecycle predecessor`);
  }
  if (before !== undefined && before !== null) {
    invariant(Date.parse(value) < Date.parse(before), `${label} is at or after campaign expiry`);
  }
}

function requireExactKeys(value, keys, label) {
  invariant(
    value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).sort().join(",") === [...keys].sort().join(","),
    `${label} fields mismatch`,
  );
}

// JSON.parse intentionally keeps the last duplicate member.  Inputs that
// authorize or reconcile a child must reject duplicates before that lossy
// conversion, including names encoded with JSON escapes.
function skipJsonWhitespace(text, index) {
  while (/\s/.test(text[index] ?? "")) index += 1;
  return index;
}

function scanJsonString(text, index) {
  invariant(text[index] === '"', "invalid JSON string");
  let cursor = index + 1;
  for (; cursor < text.length; cursor += 1) {
    if (text[cursor] === "\\") { cursor += 1; continue; }
    if (text[cursor] === '"') return cursor + 1;
    invariant(text.charCodeAt(cursor) >= 0x20, "invalid JSON control character");
  }
  throw new Error("unterminated JSON string");
}

function scanJsonValue(text, index) {
  index = skipJsonWhitespace(text, index);
  if (text[index] === '"') return scanJsonString(text, index);
  if (text[index] === "{") {
    const names = new Set();
    index = skipJsonWhitespace(text, index + 1);
    if (text[index] === "}") return index + 1;
    while (true) {
      const keyStart = index;
      const keyEnd = scanJsonString(text, index);
      const key = JSON.parse(text.slice(keyStart, keyEnd));
      invariant(!names.has(key), "JSON object has duplicate fields");
      names.add(key);
      index = skipJsonWhitespace(text, keyEnd);
      invariant(text[index] === ":", "invalid JSON object member");
      index = skipJsonWhitespace(text, scanJsonValue(text, index + 1));
      if (text[index] === "}") return index + 1;
      invariant(text[index] === ",", "invalid JSON object separator");
      index = skipJsonWhitespace(text, index + 1);
    }
  }
  if (text[index] === "[") {
    index = skipJsonWhitespace(text, index + 1);
    if (text[index] === "]") return index + 1;
    while (true) {
      index = skipJsonWhitespace(text, scanJsonValue(text, index));
      if (text[index] === "]") return index + 1;
      invariant(text[index] === ",", "invalid JSON array separator");
      index = skipJsonWhitespace(text, index + 1);
    }
  }
  const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index));
  invariant(primitive, "invalid JSON value");
  return index + primitive[0].length;
}

export function parseQaStrictJson(text, label = "JSON") {
  invariant(typeof text === "string", `${label} must be text`);
  const end = skipJsonWhitespace(text, scanJsonValue(text, 0));
  invariant(end === text.length, `${label} has trailing data`);
  return JSON.parse(text);
}

const PRIVATE_TERMINAL_STRING_PATTERNS = [
  /(?:^|[^\w.+-])[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}(?:$|[^\w.-])/i,
  /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.)/i,
  /\b(?:account|profile|user)[\s_./:-]*id\b(?:\s*[:=#_./-]?\s*\S+)?/i,
  /\b(?:user[\s_./:-]*name|handle)\b(?:\s*[:=#_./-]?\s*\S+)?/i,
  /\b(?:account|profile|user(?:name)?|handle)[\s_./:-]+[a-z0-9][a-z0-9._-]*\b/i,
  /(?:^|[\s(])@[a-z0-9_]{1,64}(?=$|[\s),.;!?])/i,
  /\b(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|auth(?:orization)?|bearer|cookie|session(?:[_ -]?id)?|credential)\b/i,
  /\b(?:private|direct)\s+(?:message|content)\b|\b(?:post|comment|feed|message|body)\s+(?:content|text)\b/i,
];

export function assertSanitizedTerminalReceiptStrings(value, path = "receipt") {
  if (typeof value === "string") {
    invariant(
      value.length <= 160 &&
        !PRIVATE_TERMINAL_STRING_PATTERNS.some((pattern) => pattern.test(value)),
      `${path} contains private or unbounded receipt content`,
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitizedTerminalReceiptStrings(entry, `${path}/${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    const safeBooleanFlags = new Set([
      "rawTargetHandlesPersisted", "privateBrowserContentPersisted",
      "credentialOrBrowserSecretHandling",
    ]);
    invariant(
      safeBooleanFlags.has(key) || !/(url|title|html|dom|credential|password|cookie|token|handle|targetid|browserstate|raw)/i.test(key),
      `${path}/${key} is private receipt data`,
    );
    assertSanitizedTerminalReceiptStrings(entry, `${path}/${key}`);
  }
}

function requireReceiptId(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  requireStableId(value, label);
}

function requireSupportedProtocolVersion(value, label) {
  invariant(
    value === "qa-manager-worker/v1",
    `${label} must be the supported protocol version`,
  );
}

// Keep runtime reconciliation as closed as the receipt schema.  These fields
// are not merely truthy/falsy policy switches: accepting a string or number
// here would allow a receipt that the schema rejects to become durable.
function assertReceiptBooleanFields(receipt) {
  const fields = [
    ["automation.managerDriven", receipt.automation.managerDriven],
    ["automation.humanPresentDuringRun", receipt.automation.humanPresentDuringRun],
    ["automation.preexistingAuthenticationOnly", receipt.automation.preexistingAuthenticationOnly],
    ["automation.unexpectedRequestObserved", receipt.automation.unexpectedRequestObserved],
    ["source.worktreeClean", receipt.source.worktreeClean],
    ["source.modifiedByQa", receipt.source.modifiedByQa],
    ["qaRepository.privateArtifactsIgnored", receipt.qaRepository.privateArtifactsIgnored],
    ["qaRepository.artifactsCommitted", receipt.qaRepository.artifactsCommitted],
    ["installation.installed", receipt.installation.installed],
    ["installation.enabled", receipt.installation.enabled],
    ["installation.cacheMatchesSource", receipt.installation.cacheMatchesSource],
    ["installation.freshTaskAfterInstall", receipt.installation.freshTaskAfterInstall],
    ["catalog.exactlyOneOrchestrator", receipt.catalog.exactlyOneOrchestrator],
    ["catalog.allLinkedPlaybooksPackaged", receipt.catalog.allLinkedPlaybooksPackaged],
    ["promptContract.planCreationAllowedBeforeBothAnswers", receipt.promptContract.planCreationAllowedBeforeBothAnswers],
    ["promptContract.guidedAndAutomaticOffered", receipt.promptContract.guidedAndAutomaticOffered],
    ["runIsolation.crossRunInheritanceObserved", receipt.runIsolation.crossRunInheritanceObserved],
    ["browserSelection.confirmedByUser", receipt.browserSelection.confirmedByUser],
    ["sanitizedInspection.existingTargetsEnumerated", receipt.sanitizedInspection.existingTargetsEnumerated],
    ["sanitizedInspection.rawTargetHandlesPersisted", receipt.sanitizedInspection.rawTargetHandlesPersisted],
    ["sanitizedInspection.broadBrowserOutputReturned", receipt.sanitizedInspection.broadBrowserOutputReturned],
    ["sanitizedInspection.privateBrowserContentPersisted", receipt.sanitizedInspection.privateBrowserContentPersisted],
    ["sanitizedInspection.screenshotsCaptured", receipt.sanitizedInspection.screenshotsCaptured],
    ["researchAcceptance.performed", receipt.researchAcceptance.performed],
    ["researchAcceptance.prefixesExact", receipt.researchAcceptance.prefixesExact],
    ["researchAcceptance.suggestionsBounded", receipt.researchAcceptance.suggestionsBounded],
    ["researchAcceptance.recommendationsEvidenceBacked", receipt.researchAcceptance.recommendationsEvidenceBacked],
    ["researchAcceptance.resultSampleInspectedEveryRecommendation", receipt.researchAcceptance.resultSampleInspectedEveryRecommendation],
    ["researchAcceptance.singleRefinementBoundPreserved", receipt.researchAcceptance.singleRefinementBoundPreserved],
    ["researchAcceptance.incrementalValidationReturned", receipt.researchAcceptance.incrementalValidationReturned],
    ["prohibitedActions.published", receipt.prohibitedActions.published],
    ["prohibitedActions.composerInteraction", receipt.prohibitedActions.composerInteraction],
    ["prohibitedActions.scrapingOrPrivateEndpoints", receipt.prohibitedActions.scrapingOrPrivateEndpoints],
    ["prohibitedActions.credentialOrBrowserSecretHandling", receipt.prohibitedActions.credentialOrBrowserSecretHandling],
    ["prohibitedActions.temporaryOrProfilelessBrowser", receipt.prohibitedActions.temporaryOrProfilelessBrowser],
    ["prohibitedActions.unboundedScrolling", receipt.prohibitedActions.unboundedScrolling],
    ["disposition.blockingProductFinding", receipt.disposition.blockingProductFinding],
  ];
  for (const [path, value] of fields) {
    invariant(typeof value === "boolean", `terminal receipt ${path} must be boolean`);
  }
}

function assertBoundedTerminalReceiptValues(receipt) {
  invariant(receipt.kind === "local_codex_acceptance", "terminal receipt kind is not allowlisted");
  requireStableId(receipt.runId, "terminal receipt runId");
  invariant(receipt.runbookVersion === "1.2", "terminal receipt runbookVersion is not allowlisted");
  invariant(receipt.scope === "setup", "terminal receipt scope is not allowlisted");
  invariant(receipt.findings.length <= 20, "terminal receipt has too many findings");
  receipt.findings.forEach((finding, index) =>
    invariant(TERMINAL_FINDINGS.has(finding), `terminal receipt finding ${index} is not allowlisted`),
  );
  const { automation, source, qaRepository, installation, catalog, promptContract,
    runIsolation, browserSelection, sanitizedInspection, researchAcceptance,
    prohibitedActions, disposition } = receipt;
  assertReceiptBooleanFields(receipt);
  for (const [label, value, nullable] of [
    ["automation scenarioId", automation.scenarioId, true],
    ["automation oracleId", automation.oracleId, true],
    ["automation answerSource", automation.answerSource, false],
    ["source path", source.path, false], ["source commit", source.commit, false],
    ["qa repository path", qaRepository.path, false], ["qa repository branch", qaRepository.branch, false],
    ["browser selection browser", browserSelection.browser, false],
    ["disposition summary", disposition.summary, false],
  ]) requireReceiptId(value, label, { nullable });
  invariant(source.path === "product_source", "terminal receipt source path is not allowlisted");
  requireGitObject(source.commit, "terminal receipt source commit");
  invariant(qaRepository.path === "qa_repository", "terminal receipt QA repository path is not allowlisted");
  invariant(qaRepository.branch === "main", "terminal receipt QA repository branch is not allowlisted");
  invariant(automation.answerSource === "manager_campaign", "campaign terminal receipt answer source is not allowlisted");
  invariant(disposition.summary === disposition.status, "terminal receipt disposition summary is not allowlisted");
  requireSupportedProtocolVersion(
    automation.protocolVersion,
    "automation protocolVersion",
  );
  invariant(typeof installation.pluginId === "string" && /^[A-Za-z0-9@._:-]{1,128}$/.test(installation.pluginId), "terminal receipt pluginId is invalid");
  invariant(typeof installation.version === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(installation.version), "terminal receipt version is invalid");
  for (const [label, value] of [
    ["automation scenarioSha256", automation.scenarioSha256],
    ["automation oracleSha256", automation.oracleSha256],
  ]) if (value !== null) requireHash(value, label);
  invariant(["chrome", "in_app"].includes(browserSelection.browser), "terminal receipt browser is invalid");
  invariant(["pass", "pass_with_findings", "blocked", "fail"].includes(disposition.status), "terminal receipt disposition is invalid");
  for (const [label, value] of Object.entries(sanitizedInspection)) {
    invariant(
      label === "dedicatedTargetsCreated" || label === "dedicatedTargetsReleased"
        ? Number.isInteger(value) && value >= 0 && value <= 10
        : typeof value === "boolean",
      `terminal receipt ${label} is invalid`,
    );
  }
  for (const group of [researchAcceptance, prohibitedActions]) {
    for (const [label, value] of Object.entries(group)) {
      invariant(typeof value === "boolean", `terminal receipt ${label} is invalid`);
    }
  }
  invariant(sanitizedInspection.rawTargetHandlesPersisted === false &&
    sanitizedInspection.privateBrowserContentPersisted === false,
  "terminal receipt retained private browser state");
  for (const [label, value] of Object.entries(automation)) {
    if (["protocolVersion", "scenarioId", "scenarioSha256", "oracleId", "oracleSha256", "answerSource", "approvedAt", "campaign"].includes(label)) continue;
    invariant(typeof value === "boolean", `terminal receipt automation ${label} is invalid`);
  }
  if (automation.approvedAt !== null) requireTimestamp(automation.approvedAt, "terminal receipt approvedAt");
  invariant(Array.isArray(catalog.topLevelSkills) && catalog.topLevelSkills.length <= 20 && catalog.topLevelSkills.every((v) => typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v)), "terminal receipt top-level skills are invalid");
  invariant(Array.isArray(catalog.linkedChannelPlaybooks) && catalog.linkedChannelPlaybooks.length <= 20 && catalog.linkedChannelPlaybooks.every((v) => RECEIPT_CHANNELS.has(v)), "terminal receipt playbooks are invalid");
  invariant(Array.isArray(runIsolation.runs) && runIsolation.runs.length <= 10 && runIsolation.runs.every((v) => typeof v === "string" && /^[a-z][a-z0-9._:-]{0,127}$/.test(v)), "terminal receipt run isolation is invalid");
}

function assertExactReceiptShape(receipt) {
  const exact = (value, keys, label) => requireExactKeys(value, keys, `terminal receipt ${label}`);
  exact(receipt.source, ["path", "commit", "worktreeClean", "modifiedByQa"], "source");
  exact(receipt.qaRepository, ["path", "branch", "privateArtifactsIgnored", "artifactsCommitted"], "qaRepository");
  exact(receipt.installation, ["pluginId", "version", "installed", "enabled", "cacheMatchesSource", "freshTaskAfterInstall"], "installation");
  exact(receipt.catalog, ["topLevelSkills", "exactlyOneOrchestrator", "linkedChannelPlaybooks", "allLinkedPlaybooksPackaged"], "catalog");
  exact(receipt.promptContract, ["firstQuestion", "secondQuestion", "planCreationAllowedBeforeBothAnswers", "guidedAndAutomaticOffered"], "promptContract");
  exact(receipt.runIsolation, ["runs", "crossRunInheritanceObserved"], "runIsolation");
  exact(receipt.browserSelection, ["browser", "confirmedByUser"], "browserSelection");
  exact(receipt.sanitizedInspection, ["existingTargetsEnumerated", "dedicatedTargetsCreated", "dedicatedTargetsReleased", "rawTargetHandlesPersisted", "broadBrowserOutputReturned", "privateBrowserContentPersisted", "screenshotsCaptured"], "sanitizedInspection");
  exact(receipt.researchAcceptance, ["performed", "prefixesExact", "suggestionsBounded", "recommendationsEvidenceBacked", "resultSampleInspectedEveryRecommendation", "singleRefinementBoundPreserved", "incrementalValidationReturned"], "researchAcceptance");
  exact(receipt.prohibitedActions, ["published", "composerInteraction", "scrapingOrPrivateEndpoints", "credentialOrBrowserSecretHandling", "temporaryOrProfilelessBrowser", "unboundedScrolling"], "prohibitedActions");
  exact(receipt.disposition, ["status", "blockingProductFinding", "summary"], "disposition");
  invariant(Array.isArray(receipt.findings), "terminal receipt findings must be an array");
  invariant(receipt.channels && typeof receipt.channels === "object" && !Array.isArray(receipt.channels), "terminal receipt channels must be an object");
  for (const [channel, evidence] of Object.entries(receipt.channels)) {
    invariant(RECEIPT_CHANNELS.has(channel), "terminal receipt has unsupported channel");
    invariant(evidence && typeof evidence === "object" && !Array.isArray(evidence), "terminal receipt channel evidence must be an object");
    invariant(Object.keys(evidence).length === 0, "terminal receipt channel evidence must be empty");
  }
}

function operationNow() {
  return new Date().toISOString();
}

function authorizationMachinery(pins) {
  return Object.fromEntries(
    AUTHORIZATION_MACHINERY_FIELDS.map((field) => [field, pins[field]]),
  );
}

export function campaignScopeSha256(scope = QA_CAMPAIGN_SCOPE, lineage = null) {
  return sha256(canonical(lineage ? { immutableScope: scope, lineage } : scope));
}

export function campaignPinsSha256(pins) {
  return sha256(canonical(pins));
}

export function campaignAuthorizationPhrase(
  campaignId,
  scopeSha256,
  runLimit = QA_CAMPAIGN_CHILD_LIMIT,
) {
  invariant(
    Number.isInteger(runLimit) && runLimit >= 1 &&
      runLimit <= QA_CAMPAIGN_CHILD_LIMIT,
    "campaign authorization run limit is invalid",
  );
  return `APPROVE QA BROWSER CAMPAIGN ${campaignId} ${scopeSha256} FOR ${runLimit} RUNS`;
}

export function campaignResumePhrase(campaignId, scopeSha256) {
  return `RESUME QA BROWSER CAMPAIGN ${campaignId} ${scopeSha256}`;
}

export function campaignRevocationPhrase(campaignId) {
  return `REVOKE QA BROWSER CAMPAIGN ${campaignId}`;
}

function assertPins(pins) {
  invariant(
    pins && typeof pins === "object" && !Array.isArray(pins),
    "pins are required",
  );
  invariant(
    Object.keys(pins).sort().join(",") === [...PIN_FIELDS].sort().join(","),
    "pin fields mismatch",
  );
  for (const field of ["productCommit", "productTree", "qaCommit", "qaTree"]) {
    requireGitObject(pins[field], field);
  }
  for (const field of PIN_FIELDS.slice(4)) requireHash(pins[field], field);
  return true;
}

function assertExactScope(scope) {
  invariant(
    canonical(scope) === canonical(QA_CAMPAIGN_SCOPE),
    "campaign immutable scope mismatch",
  );
}

function createCampaignState(spec, lineage = null, runLimit = QA_CAMPAIGN_CHILD_LIMIT) {
  invariant(spec && typeof spec === "object", "campaign spec is required");
  requireStableId(spec.campaignId, "campaignId");
  requireTrustedOperationTime(spec.createdAt, "createdAt");
  requireTimestamp(spec.expiresAt, "expiresAt");
  assertExactScope(spec.immutableScope);
  assertPins(spec.pins);
  const createdAt = Date.parse(spec.createdAt);
  const expiresAt = Date.parse(spec.expiresAt);
  invariant(expiresAt > createdAt, "campaign expiry must follow creation");
  invariant(
    expiresAt - createdAt <= QA_CAMPAIGN_MAX_AGE_MS,
    "campaign expiry exceeds seven days",
  );
  const scopeHash = campaignScopeSha256(spec.immutableScope, lineage);
  if (spec.campaignScopeSha256 !== undefined) {
    invariant(
      spec.campaignScopeSha256 === scopeHash,
      "campaign scope hash mismatch",
    );
  }
  const state = {
    schemaVersion: QA_CAMPAIGN_SCHEMA_VERSION,
    revision: 0,
    campaign: {
      campaignId: spec.campaignId,
      campaignScopeSha256: scopeHash,
      status: "pending",
      createdAt: spec.createdAt,
      activatedAt: null,
      expiresAt: spec.expiresAt,
      suspendedAt: null,
      suspensionReason: null,
      resumedAt: null,
      revokedAt: null,
      completedAt: null,
    },
    immutableScope: clone(spec.immutableScope),
    ...(lineage ? { lineage: clone(lineage) } : {}),
    authorization: {
      exactPhraseSha256: sha256(
        campaignAuthorizationPhrase(spec.campaignId, scopeHash, runLimit),
      ),
      approved: false,
      approvedAt: null,
    },
    pins: {
      current: clone(spec.pins),
      currentSha256: campaignPinsSha256(spec.pins),
      authorizationMachinerySha256: sha256(
        canonical(authorizationMachinery(spec.pins)),
      ),
      history: [],
    },
    budget: {
      limit: runLimit,
      issuedCount: 0,
      activeChild: null,
      children: [],
    },
  };
  assertQaCampaignState(state);
  return state;
}

export function createQaCampaignState(spec) {
  return createCampaignState(spec);
}

export function qaCampaignStateSha256(state) {
  assertQaCampaignState(state);
  return sha256(canonical(state));
}

export function createQaReplacementCampaignState(spec, predecessorState) {
  invariant(spec && typeof spec === "object", "campaign spec is required");
  const replacementSpecKeys = [
    "campaignId", "createdAt", "expiresAt", "immutableScope", "pins",
  ];
  requireExactKeys(
    spec,
    spec.campaignScopeSha256 === undefined
      ? replacementSpecKeys
      : [...replacementSpecKeys, "campaignScopeSha256"],
    "replacement campaign spec",
  );
  assertQaCampaignState(predecessorState);
  invariant(
    predecessorState.lineage === undefined,
    "replacement campaign cannot use a replacement predecessor",
  );
  invariant(
    predecessorState.campaign.status === "suspended",
    "replacement predecessor must be suspended",
  );
  invariant(
    predecessorState.budget.activeChild === null,
    "replacement predecessor has an active child",
  );
  const consumedBefore = predecessorState.budget.issuedCount;
  invariant(
    consumedBefore > 0 && consumedBefore < QA_CAMPAIGN_CHILD_LIMIT,
    "replacement predecessor must have between one and nine consumed children",
  );
  invariant(
    predecessorState.budget.children.every(
      (child) => child.status === "terminal" &&
        child.authorizationConsumed === true,
    ),
    "replacement predecessor children are not terminal and consumed",
  );
  invariant(
    spec.campaignId !== predecessorState.campaign.campaignId,
    "replacement campaignId must differ from predecessor",
  );
  invariant(
    Date.parse(spec.createdAt) >=
      Date.parse(predecessorState.campaign.suspendedAt),
    "replacement creation predates predecessor suspension",
  );
  const lineage = {
    kind: "replacement",
    seriesLimit: QA_CAMPAIGN_CHILD_LIMIT,
    consumedBefore,
    predecessorCampaignId: predecessorState.campaign.campaignId,
    predecessorCampaignScopeSha256:
      predecessorState.campaign.campaignScopeSha256,
    predecessorStateSha256: qaCampaignStateSha256(predecessorState),
    predecessorAuthorizationMachinerySha256:
      predecessorState.pins.authorizationMachinerySha256,
  };
  return createCampaignState(
    spec,
    lineage,
    QA_CAMPAIGN_CHILD_LIMIT - consumedBefore,
  );
}

function requireNotExpired(state, now) {
  if (Date.parse(state.campaign.expiresAt) <= Date.parse(now)) {
    throw new Error("campaign is expired; record expiry before continuing");
  }
}

function requireActiveCampaign(state, now) {
  invariant(state.campaign.status === "active", "campaign is not active");
  requireNotExpired(state, now);
  invariant(state.authorization.approved, "campaign is not authorized");
}

function advanceRevision(state) {
  state.revision += 1;
  assertQaCampaignState(state);
  return state;
}

export function authorizeQaCampaign(inputState, { phrase, at }) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  requireLifecycleTime(at, "authorization time", {
    after: state.campaign.createdAt,
    before: state.campaign.expiresAt,
  });
  invariant(state.campaign.status === "pending", "campaign is not pending");
  requireNotExpired(state, operationNow());
  invariant(
    sha256(phrase) === state.authorization.exactPhraseSha256 &&
      phrase ===
        campaignAuthorizationPhrase(
          state.campaign.campaignId,
          state.campaign.campaignScopeSha256,
          state.budget.limit,
        ),
    "exact campaign authorization phrase mismatch",
  );
  state.authorization.approved = true;
  state.authorization.approvedAt = at;
  state.campaign.status = "active";
  state.campaign.activatedAt = at;
  return advanceRevision(state);
}

function childGrantBody(state, request) {
  return {
    protocol: "qa-campaign-child-grant/v1",
    campaignId: state.campaign.campaignId,
    campaignScopeSha256: state.campaign.campaignScopeSha256,
    ordinal: (state.lineage?.consumedBefore ?? 0) +
      state.budget.issuedCount + 1,
    runId: request.runId,
    runStatePathSha256: request.runStatePathSha256,
    authorizationId: `${request.runId}:one-time-browser-access`,
    scenarioId: request.scenarioId,
    scenarioSha256: request.scenarioSha256,
    oracleId: request.oracleId,
    oracleSha256: request.oracleSha256,
    protocolVersion: request.protocolVersion,
    protocolSha256: request.protocolSha256,
    pinsSha256: state.pins.currentSha256,
    browser: request.browser,
    channels: [...request.channels],
    issuedAt: request.issuedAt,
  };
}

export function campaignChildGrantSha256(grant) {
  const body = clone(grant);
  delete body.grantSha256;
  return sha256(canonical(body));
}

function assertChildRequest(state, request) {
  invariant(request && typeof request === "object", "child request is required");
  const expectedKeys = [
    "campaignId",
    "campaignScopeSha256",
    "expectedPinsSha256",
    "runId",
    "runStatePathSha256",
    "scenarioId",
    "scenarioSha256",
    "oracleId",
    "oracleSha256",
    "protocolVersion",
    "protocolSha256",
    "browser",
    "channels",
    "issuedAt",
  ];
  invariant(
    Object.keys(request).sort().join(",") === expectedKeys.sort().join(","),
    "child request fields mismatch",
  );
  invariant(
    request.campaignId === state.campaign.campaignId,
    "child campaignId mismatch",
  );
  invariant(
    request.campaignScopeSha256 === state.campaign.campaignScopeSha256,
    "child campaign scope hash mismatch",
  );
  invariant(
    request.expectedPinsSha256 === state.pins.currentSha256,
    "stale campaign pin",
  );
  requireStableId(request.runId, "runId");
  requireHash(request.runStatePathSha256, "runStatePathSha256");
  requireStableId(request.scenarioId, "scenarioId");
  requireHash(request.scenarioSha256, "scenarioSha256");
  requireStableId(request.oracleId, "oracleId");
  requireHash(request.oracleSha256, "oracleSha256");
  invariant(
    request.protocolVersion === "qa-manager-worker/v1",
    "protocol version mismatch",
  );
  requireHash(request.protocolSha256, "protocolSha256");
  const predecessor = state.budget.children.at(-1);
  requireLifecycleTime(request.issuedAt, "issuedAt", {
    after: predecessor?.terminalAt ?? state.campaign.activatedAt,
    before: state.campaign.expiresAt,
  });
  invariant(
    request.browser === state.immutableScope.browser,
    "child browser changed immutable scope",
  );
  invariant(
    canonical(request.channels) ===
      canonical(state.immutableScope.orderedChannels),
    "child channels changed immutable scope",
  );
  invariant(
    request.scenarioSha256 === state.pins.current.scenarioSha256,
    "child scenario does not match current pin",
  );
  invariant(
    request.oracleSha256 === state.pins.current.oracleSha256,
    "child oracle does not match current pin",
  );
  invariant(
    request.protocolSha256 === state.pins.current.protocolSha256,
    "child protocol does not match current pin",
  );
}

export function issueQaCampaignChildGrant(inputState, request) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  assertChildRequest(state, request);
  requireActiveCampaign(state, operationNow());
  invariant(
    state.budget.issuedCount < state.budget.limit,
    "campaign child limit exhausted",
  );
  invariant(
    state.budget.activeChild === null,
    "campaign already has an active child",
  );
  invariant(
    !state.budget.children.some((child) => child.runId === request.runId),
    "duplicate campaign child runId",
  );
  invariant(
    !state.budget.children.some(
      (child) => child.runStatePathSha256 === request.runStatePathSha256,
    ),
    "duplicate campaign child run-state path",
  );
  const predecessor = state.budget.children.at(-1);
  if (predecessor) {
    invariant(
      predecessor.status === "terminal" &&
        predecessor.authorizationConsumed === true,
      "prior campaign child is not terminal and consumed",
    );
  }
  const body = childGrantBody(state, request);
  const grant = {
    ...body,
    grantSha256: campaignChildGrantSha256(body),
  };
  const child = {
    ordinal: grant.ordinal,
    runId: grant.runId,
    runStatePathSha256: grant.runStatePathSha256,
    grantSha256: grant.grantSha256,
    pinsSha256: grant.pinsSha256,
    status: "active",
    issuedAt: grant.issuedAt,
    terminalAt: null,
    terminalResultId: null,
    disposition: null,
    authorizationConsumed: false,
    targetDisposition: null,
    receiptSha256: null,
  };
  state.budget.issuedCount += 1;
  state.budget.activeChild = clone(child);
  state.budget.children.push(child);
  advanceRevision(state);
  return { state, grant };
}

export function assertQaCampaignChildGrant(grant) {
  invariant(grant && typeof grant === "object", "campaign child grant is required");
  requireExactKeys(grant, [
    "protocol", "campaignId", "campaignScopeSha256", "ordinal", "runId",
    "runStatePathSha256", "authorizationId", "scenarioId", "scenarioSha256",
    "oracleId", "oracleSha256", "protocolVersion", "protocolSha256",
    "pinsSha256", "browser", "channels", "issuedAt", "grantSha256",
  ], "campaign child grant");
  invariant(
    grant.protocol === "qa-campaign-child-grant/v1",
    "campaign child grant protocol mismatch",
  );
  requireStableId(grant.campaignId, "campaignId");
  requireHash(grant.campaignScopeSha256, "campaignScopeSha256");
  invariant(
    Number.isInteger(grant.ordinal) &&
      grant.ordinal >= 1 &&
      grant.ordinal <= QA_CAMPAIGN_CHILD_LIMIT,
    "campaign child ordinal is invalid",
  );
  requireStableId(grant.runId, "runId");
  requireHash(grant.runStatePathSha256, "runStatePathSha256");
  invariant(
    grant.authorizationId === `${grant.runId}:one-time-browser-access`,
    "campaign grant authorization is not bound to runId",
  );
  requireStableId(grant.scenarioId, "scenarioId");
  requireHash(grant.scenarioSha256, "scenarioSha256");
  requireStableId(grant.oracleId, "oracleId");
  requireHash(grant.oracleSha256, "oracleSha256");
  invariant(
    grant.protocolVersion === "qa-manager-worker/v1",
    "campaign grant protocol version mismatch",
  );
  requireHash(grant.protocolSha256, "protocolSha256");
  requireHash(grant.pinsSha256, "pinsSha256");
  invariant(grant.browser === "chrome", "campaign grant browser mismatch");
  invariant(
    canonical(grant.channels) ===
      canonical(QA_CAMPAIGN_SCOPE.orderedChannels),
    "campaign grant channels mismatch",
  );
  requireTimestamp(grant.issuedAt, "issuedAt");
  requireHash(grant.grantSha256, "grantSha256");
  invariant(
    grant.grantSha256 === campaignChildGrantSha256(grant),
    "campaign child grant hash mismatch",
  );
  return true;
}

export function assertQaCampaignActiveChildGrant(state, grant) {
  assertQaCampaignState(state);
  assertQaCampaignChildGrant(grant);
  const active = state.budget.activeChild;
  invariant(active, "campaign has no active child");
  invariant(
    grant.campaignId === state.campaign.campaignId &&
      grant.campaignScopeSha256 === state.campaign.campaignScopeSha256 &&
      grant.ordinal === active.ordinal && grant.runId === active.runId &&
      grant.runStatePathSha256 === active.runStatePathSha256 &&
      grant.grantSha256 === active.grantSha256 &&
      grant.pinsSha256 === active.pinsSha256 &&
      grant.pinsSha256 === state.pins.currentSha256 &&
      grant.scenarioSha256 === state.pins.current.scenarioSha256 &&
      grant.oracleSha256 === state.pins.current.oracleSha256 &&
      grant.protocolSha256 === state.pins.current.protocolSha256,
    "detached grant does not exactly match active child and current pins",
  );
  return true;
}

export function recordQaCampaignChildTerminal(inputState, evidence) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  invariant(
    ["active", "suspended", "revoked", "expired"].includes(
      state.campaign.status,
    ),
    "campaign cannot reconcile a child in its current state",
  );
  const active = state.budget.activeChild;
  invariant(active, "campaign has no active child");
  invariant(evidence && typeof evidence === "object", "terminal evidence required");
  invariant(evidence.runId === active.runId, "terminal runId mismatch");
  invariant(evidence.ordinal === active.ordinal, "terminal ordinal mismatch");
  invariant(
    evidence.grantSha256 === active.grantSha256,
    "terminal grant hash mismatch",
  );
  invariant(
    ["run_complete", "run_stopped"].includes(evidence.terminalResultId),
    "invalid child terminal result",
  );
  invariant(
    TERMINAL_DISPOSITIONS.has(evidence.disposition),
    "invalid child disposition",
  );
  invariant(
    evidence.authorizationConsumed === true,
    "child authorization is not consumed",
  );
  invariant(
    ["released", "terminal_ambiguity"].includes(evidence.targetDisposition),
    "child target release or terminal ambiguity is required",
  );
  requireHash(evidence.receiptSha256, "receiptSha256");
  requireLifecycleTime(evidence.terminalAt, "terminalAt", {
    after: active.issuedAt,
  });
  const child = state.budget.children.at(-1);
  invariant(
    child.runId === active.runId && child.status === "active",
    "active child history mismatch",
  );
  Object.assign(child, {
    status: "terminal",
    terminalAt: evidence.terminalAt,
    terminalResultId: evidence.terminalResultId,
    disposition: evidence.disposition,
    authorizationConsumed: true,
    targetDisposition: evidence.targetDisposition,
    receiptSha256: evidence.receiptSha256,
  });
  state.budget.activeChild = null;
  if (
    state.budget.issuedCount === state.budget.limit &&
    state.campaign.status === "active"
  ) {
    state.campaign.status = "completed";
    state.campaign.completedAt = evidence.terminalAt;
  }
  return advanceRevision(state);
}

export function terminalEvidenceFromArtifacts({
  campaignState,
  grant,
  runStatePath,
  runState,
  receiptRaw,
  receipt,
  terminalAt,
}) {
  assertQaCampaignState(campaignState);
  assertQaCampaignActiveChildGrant(campaignState, grant);
  const active = campaignState.budget.activeChild;
  invariant(active, "campaign has no active child");
  const productCommit = campaignState.pins.current.productCommit;
  const actualRunStatePathSha256 = qaCampaignPathSha256(runStatePath);
  invariant(
    actualRunStatePathSha256 === grant.runStatePathSha256 &&
      actualRunStatePathSha256 === active.runStatePathSha256 &&
      actualRunStatePathSha256 === runState?.campaign?.runStatePathSha256,
    "actual run-state path does not exactly match campaign binding",
  );
  invariant(runState?.run?.runId === active.runId, "run state child mismatch");
  invariant(runState?.terminal, "child run is not terminal");
  invariant(
    runState.authorization?.consumed === true &&
      runState.authorization?.browserAccessAuthorized === false,
    "child run retained browser authorization",
  );
  invariant(
    runState.campaign?.campaignId === campaignState.campaign.campaignId &&
      runState.campaign?.grantSha256 === active.grantSha256 &&
      runState.campaign?.ordinal === active.ordinal &&
      runState.campaign?.campaignScopeSha256 === grant.campaignScopeSha256 &&
      runState.campaign?.pinsSha256 === grant.pinsSha256 &&
      runState.campaign?.runStatePathSha256 === grant.runStatePathSha256 &&
      runState.run.scenarioId === grant.scenarioId &&
      runState.run.scenarioSha256 === grant.scenarioSha256 &&
      runState.run.oracleId === grant.oracleId &&
      runState.run.oracleSha256 === grant.oracleSha256 &&
      runState.run.protocolVersion === grant.protocolVersion &&
      runState.run.protocolSha256 === grant.protocolSha256 &&
      runState.run.browser === grant.browser &&
      canonical(runState.run.channels) === canonical(grant.channels) &&
      runState.authorization.authorizationId === grant.authorizationId,
    "run state campaign binding mismatch",
  );
  invariant(receipt?.runId === active.runId, "terminal receipt runId mismatch");
  requireExactKeys(
    receipt,
    [
      "schemaVersion", "kind", "runId", "capturedAt", "runbookVersion", "scope",
      "automation", "source", "qaRepository", "installation", "catalog",
      "promptContract", "runIsolation", "browserSelection", "sanitizedInspection",
      "channels", "researchAcceptance", "prohibitedActions", "findings", "disposition",
    ],
    "terminal receipt",
  );
  invariant(receipt.schemaVersion === "qa-receipt/v1", "terminal receipt schema mismatch");
  assertExactReceiptShape(receipt);
  assertSanitizedTerminalReceiptStrings(receipt);
  assertBoundedTerminalReceiptValues(receipt);
  requireTimestamp(receipt.capturedAt, "terminal receipt capturedAt");
  requireLifecycleTime(receipt.capturedAt, "terminal receipt capturedAt", {
    after: active.issuedAt,
  });
  requireLifecycleTime(terminalAt, "terminalAt", { after: receipt.capturedAt });
  requireExactKeys(receipt.automation, [
    "managerDriven", "protocolVersion", "scenarioId", "scenarioSha256",
    "oracleId", "oracleSha256", "answerSource", "humanPresentDuringRun",
    "preexistingAuthenticationOnly", "approvedAt", "unexpectedRequestObserved",
    "campaign",
  ], "terminal receipt automation");
  invariant(receipt.automation?.managerDriven === true, "terminal receipt is not manager-driven");
  invariant(receipt.automation?.protocolVersion === runState.run.protocolVersion, "terminal receipt protocol mismatch");
  invariant(receipt.automation?.scenarioId === runState.run.scenarioId, "terminal receipt scenario mismatch");
  invariant(receipt.automation?.scenarioSha256 === runState.run.scenarioSha256, "terminal receipt scenario hash mismatch");
  invariant(receipt.automation?.oracleId === runState.run.oracleId, "terminal receipt oracle mismatch");
  invariant(receipt.automation?.oracleSha256 === runState.run.oracleSha256, "terminal receipt oracle hash mismatch");
  invariant(
    receipt.browserSelection?.browser === grant.browser &&
      receipt.browserSelection.browser === runState.run.browser,
    "terminal receipt browser does not exactly match grant and run",
  );
  invariant(
    receipt.source?.commit === productCommit,
    "terminal receipt source commit does not match current product pin",
  );
  for (const [action, performed] of Object.entries(receipt.prohibitedActions ?? {})) {
    invariant(performed === false, `terminal receipt prohibited action ${action} must be false`);
  }
  invariant(receipt.disposition?.status === runState.terminal.disposition, "terminal receipt disposition mismatch");
  invariant(
    receipt.channels && typeof receipt.channels === "object" && !Array.isArray(receipt.channels) &&
      canonical(Object.keys(receipt.channels).sort()) === canonical([...runState.run.channels].sort()),
    "terminal receipt channel coverage mismatch",
  );
  requireExactKeys(receipt.automation.campaign, [
    "campaignId", "campaignScopeSha256", "ordinal", "grantSha256", "pinsSha256",
  ], "terminal receipt campaign");
  invariant(
    receipt?.automation?.campaign?.campaignId ===
      campaignState.campaign.campaignId &&
      receipt?.automation?.campaign?.campaignScopeSha256 ===
        campaignState.campaign.campaignScopeSha256 &&
      receipt?.automation?.campaign?.grantSha256 === active.grantSha256 &&
      receipt?.automation?.campaign?.ordinal === active.ordinal &&
      receipt?.automation?.campaign?.pinsSha256 === active.pinsSha256,
    "terminal receipt campaign binding mismatch",
  );
  const checkpointTarget = runState.terminal.checkpoint?.action?.target;
  const targetDisposition =
    checkpointTarget && checkpointTarget.state !== "released"
      ? "terminal_ambiguity"
      : "released";
  return {
    runId: active.runId,
    ordinal: active.ordinal,
    grantSha256: active.grantSha256,
    terminalResultId: runState.terminal.resultId,
    disposition: runState.terminal.disposition,
    authorizationConsumed: true,
    targetDisposition,
    receiptSha256: sha256(receiptRaw),
    terminalAt,
  };
}

function latestLifecyclePredecessor(state) {
  const timestamps = [
    state.campaign.createdAt,
    state.authorization.approvedAt,
    state.campaign.activatedAt,
    state.campaign.suspendedAt,
    state.campaign.resumedAt,
    state.campaign.revokedAt,
    state.campaign.completedAt,
    ...state.budget.children.flatMap((child) => [child.issuedAt, child.terminalAt]),
  ].filter(Boolean);
  return timestamps.reduce(
    (latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest,
    state.campaign.createdAt,
  );
}

function assertTimestampNotBefore(value, predecessor, message) {
  invariant(Date.parse(value) >= Date.parse(predecessor), message);
}

export function suspendQaCampaign(inputState, { reason, at }) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  requireLifecycleTime(at, "suspendedAt", {
    after: latestLifecyclePredecessor(state),
    before: state.campaign.expiresAt,
  });
  requireStableId(reason, "suspension reason");
  invariant(state.campaign.status === "active", "campaign is not active");
  state.campaign.status = "suspended";
  state.campaign.suspendedAt = at;
  state.campaign.suspensionReason = reason;
  return advanceRevision(state);
}

export function resumeQaCampaign(inputState, { phrase, at }) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  requireLifecycleTime(at, "resume time", {
    after: latestLifecyclePredecessor(state),
    before: state.campaign.expiresAt,
  });
  invariant(state.campaign.status === "suspended", "campaign is not suspended");
  invariant(state.budget.activeChild === null, "active child blocks campaign resume");
  requireNotExpired(state, operationNow());
  invariant(
    phrase ===
      campaignResumePhrase(
        state.campaign.campaignId,
        state.campaign.campaignScopeSha256,
      ),
    "exact campaign resume phrase mismatch",
  );
  state.campaign.status = "active";
  state.campaign.suspendedAt = null;
  state.campaign.suspensionReason = null;
  state.campaign.resumedAt = at;
  return advanceRevision(state);
}

export function revokeQaCampaign(inputState, { phrase, at }) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  requireLifecycleTime(at, "revokedAt", {
    after: latestLifecyclePredecessor(state),
  });
  invariant(
    !["revoked", "expired", "completed"].includes(state.campaign.status),
    "campaign is already terminal",
  );
  invariant(
    phrase === campaignRevocationPhrase(state.campaign.campaignId),
    "exact campaign revocation phrase mismatch",
  );
  state.campaign.status = "revoked";
  state.campaign.revokedAt = at;
  return advanceRevision(state);
}

export function expireQaCampaign(inputState, { at }) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  requireTrustedOperationTime(at, "expiry time");
  invariant(
    !["revoked", "expired", "completed"].includes(state.campaign.status),
    "campaign is already terminal",
  );
  invariant(
    Date.parse(at) >= Date.parse(state.campaign.expiresAt),
    "campaign has not expired",
  );
  state.campaign.status = "expired";
  return advanceRevision(state);
}

export function advanceQaCampaignPins(inputState, request) {
  const state = clone(inputState);
  assertQaCampaignState(state);
  requireLifecycleTime(request.at, "pin advancement time", {
    after: state.budget.children.at(-1)?.terminalAt ?? state.campaign.resumedAt ?? state.campaign.activatedAt,
    before: state.campaign.expiresAt,
  });
  requireActiveCampaign(state, operationNow());
  invariant(
    state.budget.activeChild === null,
    "cannot advance pins during an active child",
  );
  invariant(
    request.expectedPinsSha256 === state.pins.currentSha256,
    "stale campaign pin",
  );
  invariant(request.judgeApproved === true, "pin advancement lacks Judge approval");
  invariant(request.qaRepinVerified === true, "exact QA repin is not verified");
  invariant(
    request.hashesVerified === true,
    "pin advancement hashes are not verified",
  );
  invariant(
    request.offlineVerified === true && request.releaseVerified === true,
    "pin advancement verification is incomplete",
  );
  assertPins(request.pins);
  invariant(
    sha256(canonical(authorizationMachinery(request.pins))) ===
      state.pins.authorizationMachinerySha256,
    "pin evolution changed authorization machinery",
  );
  state.pins.history.push({
    pinsSha256: state.pins.currentSha256,
    supersededAt: request.at,
  });
  state.pins.current = clone(request.pins);
  state.pins.currentSha256 = campaignPinsSha256(request.pins);
  return advanceRevision(state);
}

export function assertQaCampaignState(state) {
  const stateKeys = [
    "schemaVersion", "revision", "campaign", "immutableScope",
    "authorization", "pins", "budget",
  ];
  requireExactKeys(
    state,
    state?.lineage === undefined ? stateKeys : [...stateKeys, "lineage"],
    "campaign state",
  );
  invariant(
    state?.schemaVersion === QA_CAMPAIGN_SCHEMA_VERSION,
    "campaign state schema mismatch",
  );
  invariant(
    Number.isInteger(state.revision) && state.revision >= 0,
    "invalid campaign revision",
  );
  requireExactKeys(state.campaign, ["campaignId", "campaignScopeSha256", "status", "createdAt", "activatedAt", "expiresAt", "suspendedAt", "suspensionReason", "resumedAt", "revokedAt", "completedAt"], "campaign");
  requireStableId(state.campaign?.campaignId, "campaignId");
  requireHash(state.campaign?.campaignScopeSha256, "campaignScopeSha256");
  invariant(
    CAMPAIGN_STATUSES.has(state.campaign?.status),
    "invalid campaign status",
  );
  for (const [field, nullable] of [
    ["createdAt", false],
    ["activatedAt", true],
    ["expiresAt", false],
    ["suspendedAt", true],
    ["resumedAt", true],
    ["revokedAt", true],
    ["completedAt", true],
  ]) {
    if (state.campaign[field] !== null || !nullable) {
      requireTimestamp(state.campaign[field], field);
    }
  }
  assertExactScope(state.immutableScope);
  if (state.lineage !== undefined) {
    requireExactKeys(state.lineage, [
      "kind", "seriesLimit", "consumedBefore", "predecessorCampaignId",
      "predecessorCampaignScopeSha256", "predecessorStateSha256",
      "predecessorAuthorizationMachinerySha256",
    ], "campaign lineage");
    invariant(
      state.lineage.kind === "replacement",
      "campaign lineage kind mismatch",
    );
    invariant(
      state.lineage.seriesLimit === QA_CAMPAIGN_CHILD_LIMIT,
      "campaign lineage series limit mismatch",
    );
    invariant(
      Number.isInteger(state.lineage.consumedBefore) &&
        state.lineage.consumedBefore > 0 &&
        state.lineage.consumedBefore < QA_CAMPAIGN_CHILD_LIMIT,
      "campaign lineage consumed count is invalid",
    );
    requireStableId(
      state.lineage.predecessorCampaignId,
      "predecessorCampaignId",
    );
    invariant(
      state.lineage.predecessorCampaignId !== state.campaign.campaignId,
      "campaign lineage cannot reference itself",
    );
    requireHash(
      state.lineage.predecessorCampaignScopeSha256,
      "predecessorCampaignScopeSha256",
    );
    requireHash(
      state.lineage.predecessorStateSha256,
      "predecessorStateSha256",
    );
    requireHash(
      state.lineage.predecessorAuthorizationMachinerySha256,
      "predecessorAuthorizationMachinerySha256",
    );
  }
  invariant(
    campaignScopeSha256(state.immutableScope, state.lineage ?? null) ===
      state.campaign.campaignScopeSha256,
    "stored campaign scope hash mismatch",
  );
  requireExactKeys(state.authorization, ["exactPhraseSha256", "approved", "approvedAt"], "authorization");
  requireHash(state.authorization?.exactPhraseSha256, "exactPhraseSha256");
  invariant(
    state.authorization.exactPhraseSha256 === sha256(
      campaignAuthorizationPhrase(
        state.campaign.campaignId,
        state.campaign.campaignScopeSha256,
        state.budget?.limit,
      ),
    ),
    "stored campaign authorization phrase hash mismatch",
  );
  invariant(
    typeof state.authorization?.approved === "boolean",
    "campaign approval flag missing",
  );
  if (state.authorization.approvedAt !== null) {
    requireTimestamp(state.authorization.approvedAt, "approvedAt");
  }
  if (state.campaign.status !== "pending") {
    invariant(state.authorization.approved, "non-pending campaign lacks approval");
  }
  const campaign = state.campaign;
  const approved = state.authorization;
  const timestampsAfterCreation = [campaign.activatedAt, approved.approvedAt,
    campaign.suspendedAt, campaign.resumedAt, campaign.revokedAt, campaign.completedAt].filter(Boolean);
  invariant(timestampsAfterCreation.every((value) => Date.parse(value) >= Date.parse(campaign.createdAt)), "campaign timestamp predates creation");
  invariant(
    Date.parse(campaign.expiresAt) > Date.parse(campaign.createdAt),
    "campaign expiry predates creation",
  );
  invariant(
    Date.parse(campaign.expiresAt) - Date.parse(campaign.createdAt) <=
      QA_CAMPAIGN_MAX_AGE_MS,
    "campaign expiry exceeds seven days",
  );
  const suspendedPair = (campaign.suspendedAt === null && campaign.suspensionReason === null) ||
    (campaign.suspendedAt !== null && typeof campaign.suspensionReason === "string");
  invariant(suspendedPair, "campaign suspension timestamp and reason are inconsistent");
  if (campaign.status === "pending") {
    invariant(!approved.approved && approved.approvedAt === null && campaign.activatedAt === null && campaign.suspendedAt === null && campaign.suspensionReason === null && campaign.resumedAt === null && campaign.revokedAt === null && campaign.completedAt === null, "pending campaign authorization state is inconsistent");
  } else {
    invariant(approved.approved && approved.approvedAt !== null && campaign.activatedAt !== null, "authorized campaign lacks approval or activation timestamps");
    invariant(Date.parse(campaign.activatedAt) >= Date.parse(approved.approvedAt), "campaign activated before approval");
    if (campaign.resumedAt !== null) invariant(Date.parse(campaign.resumedAt) >= Date.parse(campaign.activatedAt), "campaign resume predates activation");
    if (campaign.status === "active") invariant(campaign.suspendedAt === null && campaign.suspensionReason === null && campaign.revokedAt === null && campaign.completedAt === null, "active campaign terminal state is inconsistent");
    if (campaign.status === "suspended") invariant(campaign.suspendedAt !== null && campaign.revokedAt === null && campaign.completedAt === null, "suspended campaign state is inconsistent");
    if (campaign.status === "revoked") invariant(campaign.revokedAt !== null && campaign.completedAt === null, "revoked campaign state is inconsistent");
    if (campaign.status === "expired") invariant(campaign.revokedAt === null && campaign.completedAt === null, "expired campaign state is inconsistent");
    if (campaign.status === "completed") invariant(campaign.suspendedAt === null && campaign.suspensionReason === null && campaign.revokedAt === null && campaign.completedAt !== null, "completed campaign state is inconsistent");
  }
  requireExactKeys(state.pins, ["current", "currentSha256", "authorizationMachinerySha256", "history"], "pins");
  assertPins(state.pins?.current);
  requireHash(state.pins?.currentSha256, "currentPinsSha256");
  invariant(
    campaignPinsSha256(state.pins.current) === state.pins.currentSha256,
    "stored campaign pin hash mismatch",
  );
  requireHash(
    state.pins.authorizationMachinerySha256,
    "authorizationMachinerySha256",
  );
  invariant(
    sha256(canonical(authorizationMachinery(state.pins.current))) ===
      state.pins.authorizationMachinerySha256,
    "stored authorization machinery binding mismatch",
  );
  invariant(Array.isArray(state.pins.history), "pin history is required");
  state.pins.history.forEach((entry) => {
    requireExactKeys(entry, ["pinsSha256", "supersededAt"], "pin history entry");
    requireHash(entry.pinsSha256, "historical pinsSha256");
    requireTimestamp(entry.supersededAt, "historical supersededAt");
  });
  requireExactKeys(state.budget, ["limit", "issuedCount", "activeChild", "children"], "budget");
  const expectedBudgetLimit = state.lineage === undefined
    ? QA_CAMPAIGN_CHILD_LIMIT
    : state.lineage.seriesLimit - state.lineage.consumedBefore;
  invariant(
    state.budget?.limit === expectedBudgetLimit,
    "campaign child limit mismatch",
  );
  invariant(
    Number.isInteger(state.budget.issuedCount) &&
      state.budget.issuedCount >= 0 &&
      state.budget.issuedCount <= state.budget.limit,
    "invalid issued child count",
  );
  invariant(Array.isArray(state.budget.children), "child history is required");
  invariant(
    state.budget.children.length === state.budget.issuedCount,
    "issued count does not match child history",
  );
  invariant(
    new Set(state.budget.children.map((child) => child.runId)).size ===
      state.budget.children.length,
    "duplicate campaign child runId",
  );
  invariant(
    new Set(state.budget.children.map((child) => child.runStatePathSha256))
      .size === state.budget.children.length,
    "duplicate campaign child run-state path",
  );
  let activeCount = 0;
  const ordinalOffset = state.lineage?.consumedBefore ?? 0;
  state.budget.children.forEach((child, index) => {
    requireExactKeys(child, ["ordinal", "runId", "runStatePathSha256", "grantSha256", "pinsSha256", "status", "issuedAt", "terminalAt", "terminalResultId", "disposition", "authorizationConsumed", "targetDisposition", "receiptSha256"], "campaign child");
    invariant(
      child.ordinal === ordinalOffset + index + 1,
      "campaign child ordinal gap",
    );
    requireStableId(child.runId, "child runId");
    requireHash(child.runStatePathSha256, "child runStatePathSha256");
    requireHash(child.grantSha256, "child grantSha256");
    requireHash(child.pinsSha256, "child pinsSha256");
    requireTimestamp(child.issuedAt, "child issuedAt");
    invariant(Date.parse(child.issuedAt) >= Date.parse(campaign.activatedAt), "child issuance predates activation");
    invariant(Date.parse(child.issuedAt) < Date.parse(campaign.expiresAt), "child issuance is at or after campaign expiry");
    if (index > 0) invariant(Date.parse(child.issuedAt) >= Date.parse(state.budget.children[index - 1].terminalAt), "child issuance predates predecessor terminal");
    invariant(["active", "terminal"].includes(child.status), "invalid child status");
    if (child.status === "active") {
      activeCount += 1;
      invariant(
        child.authorizationConsumed === false &&
          child.terminalAt === null &&
          child.receiptSha256 === null,
        "active child retained terminal evidence",
      );
    } else {
      requireTimestamp(child.terminalAt, "child terminalAt");
      invariant(Date.parse(child.terminalAt) >= Date.parse(child.issuedAt), "child terminal predates issuance");
      invariant(child.authorizationConsumed === true, "terminal child retained authority");
      invariant(
        ["run_complete", "run_stopped"].includes(child.terminalResultId),
        "terminal child result invalid",
      );
      invariant(
        TERMINAL_DISPOSITIONS.has(child.disposition),
        "terminal child disposition invalid",
      );
      invariant(
        ["released", "terminal_ambiguity"].includes(child.targetDisposition),
        "terminal child target disposition invalid",
      );
      requireHash(child.receiptSha256, "child receiptSha256");
    }
  });
  invariant(activeCount <= 1, "multiple campaign children are active");
  if (state.budget.activeChild === null) {
    invariant(activeCount === 0, "active child pointer is missing");
  } else {
    invariant(activeCount === 1, "active child pointer is inconsistent");
    invariant(
      canonical(state.budget.activeChild) ===
        canonical(state.budget.children.at(-1)),
      "active child pointer differs from child history",
    );
  }
  if (state.campaign.status === "completed") {
    invariant(
      state.budget.issuedCount === state.budget.limit &&
        state.budget.activeChild === null,
      "completed campaign did not consume its full child budget",
    );
  }
  if (campaign.completedAt !== null) {
    invariant(Date.parse(campaign.completedAt) >= Date.parse(state.budget.children.at(-1)?.terminalAt), "campaign completion predates terminal child");
  }
  const childLifecycleLatest = state.budget.children.flatMap((child) => [
    child.issuedAt,
    child.terminalAt,
  ]).filter(Boolean).reduce(
    (latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest,
    campaign.activatedAt ?? campaign.createdAt,
  );
  const childIssuanceLatest = state.budget.children.map((child) => child.issuedAt)
    .reduce(
      (latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest,
      campaign.activatedAt ?? campaign.createdAt,
    );
  if (campaign.suspendedAt !== null) {
    assertTimestampNotBefore(
      campaign.suspendedAt,
      childLifecycleLatest,
      "campaign suspension predates latest child lifecycle event",
    );
    assertTimestampNotBefore(
      campaign.suspendedAt,
      [campaign.createdAt, approved.approvedAt, campaign.activatedAt, campaign.resumedAt]
        .filter(Boolean)
        .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest),
      "campaign suspension predates prior lifecycle transition",
    );
  }
  if (campaign.revokedAt !== null) {
    assertTimestampNotBefore(
      campaign.revokedAt,
      childIssuanceLatest,
      "campaign revocation predates latest child issuance",
    );
    assertTimestampNotBefore(
      campaign.revokedAt,
      [campaign.createdAt, approved.approvedAt, campaign.activatedAt, campaign.suspendedAt, campaign.resumedAt]
        .filter(Boolean)
        .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest),
      "campaign revocation predates prior lifecycle transition",
    );
  }
  return true;
}

async function writeJsonAtomic(path, value) {
  const absolute = resolve(path);
  const temporary = resolve(
    dirname(absolute),
    `.qa-campaign-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, absolute);
}

async function writeJsonExclusive(path, value) {
  const absolute = resolve(path);
  const temporary = resolve(
    dirname(absolute),
    `.qa-campaign-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await link(temporary, absolute);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export function qaCampaignClaimPath(statePath) {
  const absolute = resolve(statePath);
  return resolve(
    dirname(absolute),
    `.qa-campaign-${sha256(canonical({ statePath: absolute }))}.claim`,
  );
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export async function acquireQaCampaignClaim(statePath, command) {
  const path = qaCampaignClaimPath(statePath);
  const claim = {
    schemaVersion: "qa-campaign-mutation-claim/v1",
    nonce: randomUUID(),
    pid: process.pid,
    command,
    createdAt: new Date().toISOString(),
  };
  const serialized = `${JSON.stringify(claim)}\n`;
  const deadline = Date.now() + MUTATION_CLAIM_WAIT_MS;
  let handle;
  while (!handle) {
    try {
      handle = await open(path, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(
          "campaign mutation claim is unavailable; ownership is ambiguous",
        );
      }
      await wait(MUTATION_CLAIM_RETRY_MS);
    }
  }
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  }
  let released = false;
  return {
    path,
    claim,
    async release() {
      invariant(!released, "campaign claim was already released");
      invariant(
        (await readFile(path, "utf8")) === serialized,
        "campaign claim ownership is uncertain",
      );
      await unlink(path);
      released = true;
    },
  };
}

async function mutateSavedCampaign(statePath, command, mutate) {
  const claim = await acquireQaCampaignClaim(statePath, command);
  let persistenceStarted = false;
  try {
    if (process.env.QA_CAMPAIGN_TEST_CRASH_AFTER_CLAIM === "1") {
      process.exit(85);
    }
    const state = parseQaStrictJson(await readFile(resolve(statePath), "utf8"), "campaign state");
    assertQaCampaignState(state);
    const mutation = await mutate(state);
    assertQaCampaignState(mutation.state);
    persistenceStarted = true;
    await writeJsonAtomic(statePath, mutation.state);
    if (process.env.QA_CAMPAIGN_TEST_CRASH_AFTER_PERSIST === "1") {
      process.exit(86);
    }
    await claim.release();
    return mutation.output;
  } catch (error) {
    if (!persistenceStarted) await claim.release().catch(() => {});
    throw error;
  }
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

export async function recoverStaleQaCampaignClaim(
  statePath,
  { expectedNonce, at },
) {
  requireStableId(expectedNonce, "expected claim nonce");
  requireTimestamp(at, "stale claim recovery time");
  const path = qaCampaignClaimPath(statePath);
  const raw = await readFile(path, "utf8");
  // Reject duplicate members before checking ownership. JSON.parse would
  // otherwise let an escaped duplicate replace the checked nonce or PID.
  const claim = parseQaStrictJson(raw, "campaign mutation claim");
  invariant(
    claim.schemaVersion === "qa-campaign-mutation-claim/v1" &&
      claim.nonce === expectedNonce,
    "stale campaign claim identity mismatch",
  );
  invariant(
    Number.isInteger(claim.pid) && !pidIsAlive(claim.pid),
    "campaign claim owner may still be alive",
  );
  // State is authoritative for the suspension mutation, so apply the same
  // escape-aware duplicate rejection before it can be validated or written.
  const state = parseQaStrictJson(
    await readFile(resolve(statePath), "utf8"),
    "campaign state",
  );
  assertQaCampaignState(state);
  let next = state;
  if (state.campaign.status === "active") {
    next = suspendQaCampaign(state, {
      reason: "stale_mutation_claim",
      at,
    });
    await writeJsonAtomic(statePath, next);
  }
  invariant(
    (await readFile(path, "utf8")) === raw,
    "stale campaign claim changed during recovery",
  );
  await unlink(path);
  return {
    ok: true,
    campaignId: next.campaign.campaignId,
    status: next.campaign.status,
    issuedCount: next.budget.issuedCount,
  };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    invariant(flag?.startsWith("--") && value, `invalid argument: ${flag ?? ""}`);
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

async function readJson(path) {
  const raw = await readFile(resolve(path));
  invariant(!raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), "JSON BOM is forbidden");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
  catch { throw new Error("JSON must be valid UTF-8"); }
  return parseQaStrictJson(text, "campaign JSON input");
}

export async function runQaCampaignCli(argv) {
  const { command, options } = parseArguments(argv);
  invariant(options.state, "--state is required");
  if (command === "create") {
    invariant(options.spec, "--spec is required");
    const state = createQaCampaignState(await readJson(options.spec));
    await writeJsonExclusive(options.state, state);
    return {
      ok: true,
      schemaVersion: state.schemaVersion,
      campaignId: state.campaign.campaignId,
      campaignScopeSha256: state.campaign.campaignScopeSha256,
      runLimit: state.budget.limit,
    };
  }
  if (command === "create-replacement") {
    invariant(
      options.spec && options["predecessor-state"],
      "--spec and --predecessor-state are required",
    );
    const [spec, predecessorState] = await Promise.all([
      readJson(options.spec),
      readJson(options["predecessor-state"]),
    ]);
    const state = createQaReplacementCampaignState(spec, predecessorState);
    await writeJsonExclusive(options.state, state);
    return {
      ok: true,
      schemaVersion: state.schemaVersion,
      campaignId: state.campaign.campaignId,
      campaignScopeSha256: state.campaign.campaignScopeSha256,
      runLimit: state.budget.limit,
      consumedBefore: state.lineage.consumedBefore,
      seriesLimit: state.lineage.seriesLimit,
      predecessorCampaignId: state.lineage.predecessorCampaignId,
      predecessorStateSha256: state.lineage.predecessorStateSha256,
    };
  }
  if (command === "check") {
    const state = await readJson(options.state);
    assertQaCampaignState(state);
    return {
      ok: true,
      campaignId: state.campaign.campaignId,
      status: state.campaign.status,
      issuedCount: state.budget.issuedCount,
      runLimit: state.budget.limit,
      consumedBefore: state.lineage?.consumedBefore ?? 0,
      seriesIssuedCount:
        (state.lineage?.consumedBefore ?? 0) + state.budget.issuedCount,
      predecessorCampaignId:
        state.lineage?.predecessorCampaignId ?? null,
      predecessorStateSha256:
        state.lineage?.predecessorStateSha256 ?? null,
      activeOrdinal: state.budget.activeChild?.ordinal ?? null,
    };
  }
  if (command === "recover-stale-claim") {
    invariant(options.nonce && options.at, "--nonce and --at are required");
    return recoverStaleQaCampaignClaim(options.state, {
      expectedNonce: options.nonce,
      at: options.at,
    });
  }
  return mutateSavedCampaign(options.state, command, async (state) => {
    if (command === "authorize") {
      invariant(options.phrase && options.at, "--phrase and --at are required");
      const next = authorizeQaCampaign(state, {
        phrase: options.phrase,
        at: options.at,
      });
      return {
        state: next,
        output: {
          ok: true,
          campaignId: next.campaign.campaignId,
          status: next.campaign.status,
        },
      };
    }
    if (command === "issue-child-grant") {
      invariant(options.request, "--request is required");
      const issuance = issueQaCampaignChildGrant(
        state,
        await readJson(options.request),
      );
      return { state: issuance.state, output: issuance.grant };
    }
    if (command === "record-child-terminal") {
      invariant(
        options["run-state"] && options.receipt && options.grant && options.at,
        "--run-state, --receipt, --grant, and --at are required",
      );
      const [runState, grant, receiptRaw] = await Promise.all([
        readJson(options["run-state"]),
        readDetachedGrant(options.grant),
        readFile(resolve(options.receipt), "utf8"),
      ]);
      const { assertQaManagerRunState } = await import("./qa-recovery.mjs");
      assertQaManagerRunState(runState);
      const evidence = terminalEvidenceFromArtifacts({
        campaignState: state,
        grant,
        runStatePath: options["run-state"],
        runState,
        receiptRaw,
        receipt: parseQaStrictJson(receiptRaw, "terminal receipt"),
        terminalAt: options.at,
      });
      const next = recordQaCampaignChildTerminal(state, evidence);
      return {
        state: next,
        output: {
          ok: true,
          campaignId: next.campaign.campaignId,
          ordinal: evidence.ordinal,
          status: next.campaign.status,
        },
      };
    }
    if (command === "suspend") {
      invariant(options.reason && options.at, "--reason and --at are required");
      const next = suspendQaCampaign(state, {
        reason: options.reason,
        at: options.at,
      });
      return {
        state: next,
        output: { ok: true, status: next.campaign.status },
      };
    }
    if (command === "resume") {
      invariant(options.phrase && options.at, "--phrase and --at are required");
      const next = resumeQaCampaign(state, {
        phrase: options.phrase,
        at: options.at,
      });
      return {
        state: next,
        output: { ok: true, status: next.campaign.status },
      };
    }
    if (command === "revoke") {
      invariant(options.phrase && options.at, "--phrase and --at are required");
      const next = revokeQaCampaign(state, {
        phrase: options.phrase,
        at: options.at,
      });
      return {
        state: next,
        output: { ok: true, status: next.campaign.status },
      };
    }
    if (command === "expire") {
      invariant(options.at, "--at is required");
      const next = expireQaCampaign(state, { at: options.at });
      return {
        state: next,
        output: { ok: true, status: next.campaign.status },
      };
    }
    if (command === "advance-pin") {
      invariant(options.request, "--request is required");
      const next = advanceQaCampaignPins(state, await readJson(options.request));
      return {
        state: next,
        output: {
          ok: true,
          campaignId: next.campaign.campaignId,
          pinsSha256: next.pins.currentSha256,
        },
      };
    }
    throw new Error("unknown campaign command");
  });
}

async function readDetachedGrant(path) {
  const raw = await readFile(resolve(path));
  invariant(!raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), "campaign grant BOM is forbidden");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
  catch { throw new Error("campaign grant must be valid UTF-8"); }
  // A grant is a flat object apart from its ordered primitive array; reject
  // duplicate member tokens before JSON.parse can erase them.
  const grant = parseQaStrictJson(text, "campaign grant");
  assertQaCampaignChildGrant(grant);
  return grant;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  runQaCampaignCli(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
