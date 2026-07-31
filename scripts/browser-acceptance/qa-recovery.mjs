#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { link, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertQaCampaignChildGrant, parseQaStrictJson, qaCampaignPathSha256 } from "./qa-campaign.mjs";

export const QA_RECOVERY_SCHEMA_VERSION = "qa-manager-run-state/v1";
export const QA_RECOVERY_RETRY_LIMIT = 1;
export const QA_BROWSER_ACTION = "bounded_autocomplete_research";
export const QA_BROWSER_ACTION_TIMEOUT_MS = 60_000;
export const QA_DEDICATED_TARGET_OWNERSHIP = "plugin_owned";

const OFFICIAL_ROOTS = {
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  linkedin: "https://www.linkedin.com/",
  x: "https://x.com/",
  tiktok: "https://www.tiktok.com/",
  youtube: "https://www.youtube.com/",
  pinterest: "https://www.pinterest.com/",
};

export function browserActionDescriptorHash({
  channel,
  browser,
  action = QA_BROWSER_ACTION,
  timeoutMs = QA_BROWSER_ACTION_TIMEOUT_MS,
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      action,
      browser,
      channel,
      timeoutMs,
      targetAcquisition: "new_agent_tab",
      targetOfficialRoot: OFFICIAL_ROOTS[channel],
      targetOwnership: QA_DEDICATED_TARGET_OWNERSHIP,
    }))
    .digest("hex");
}

export function dedicatedTargetLeaseHash({
  runId,
  taskId,
  channel,
  browser,
  actionHash,
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      actionHash,
      browser,
      channel,
      contract: "dedicated-target-lease/v1",
      runId,
      taskId,
    }))
    .digest("hex");
}

export function issueQaCheckpointAck(inputState) {
  assertQaManagerRunState(inputState);
  const state = clone(inputState);
  requireActiveRun(state);
  requireActiveTask(state);
  const pending = state.protocol.pending;
  invariant(
    pending?.requestId === "channel_begin" &&
      pending.action.state === "started" &&
      pending.action.acknowledgementState === "pending",
    "browser action acknowledgement is not available for issuance",
  );
  requireHash(pending.action.target.leaseHash, "targetLeaseHash");
  const acknowledgement = qaCheckpointAckEnvelope(state);
  pending.action.acknowledgementState = "issued";
  assertQaManagerRunState(state);
  return { state, acknowledgement };
}

function qaCheckpointAckEnvelope(state) {
  assertQaManagerRunState(state);
  const pending = state.protocol.pending;
  invariant(
    pending?.requestId === "channel_begin" &&
      pending.action.state === "started" &&
      ["pending", "issued"].includes(pending.action.acknowledgementState),
    "browser action acknowledgement is not durably authorized",
  );
  requireHash(pending.action.target.leaseHash, "targetLeaseHash");
  return {
    protocol: "qa-manager-worker/v1",
    runId: state.run.runId,
    sequence: pending.sequence,
    checkpointId: "browser_action_started",
    channel: pending.channel,
    actionHash: pending.action.hash,
    timeoutMs: pending.action.timeoutMs,
    targetLeaseHash: pending.action.target.leaseHash,
  };
}

export function issueAuthenticationRecoveryLease(inputState) {
  assertQaManagerRunState(inputState);
  const state = clone(inputState);
  requireActiveRun(state);
  requireActiveTask(state);
  const pending = state.protocol.pending;
  invariant(
    pending?.requestId === "channel_begin" &&
      pending.action.state === "started" &&
      pending.action.target.state === "recreation_required" &&
      pending.action.target.recoveryLeaseDeliveryState === "pending",
    "authentication recovery lease is not available for issuance",
  );
  requireHash(pending.action.target.leaseHash, "targetLeaseHash");
  const delivery = {
    protocol: "qa-manager-worker/v1",
    runId: state.run.runId,
    sequence: pending.sequence,
    checkpointId: "authentication_recovery_target",
    channel: pending.channel,
    targetLeaseHash: pending.action.target.leaseHash,
  };
  pending.action.target.recoveryLeaseDeliveryState = "issued";
  assertQaManagerRunState(state);
  return { state, delivery };
}

export function assertQaCheckpointAck(intent, acknowledgement) {
  invariant(intent && typeof intent === "object", "start intent is required");
  invariant(
    acknowledgement && typeof acknowledgement === "object",
    "QA_CHECKPOINT_ACK is required",
  );
  const expectedKeys = [
    "protocol",
    "runId",
    "sequence",
    "checkpointId",
    "channel",
    "actionHash",
    "timeoutMs",
    "targetLeaseHash",
  ];
  invariant(
    Object.keys(acknowledgement).sort().join(",") ===
      [...expectedKeys].sort().join(","),
    "QA_CHECKPOINT_ACK fields mismatch",
  );
  for (const field of [
    "protocol",
    "runId",
    "sequence",
    "channel",
    "actionHash",
    "timeoutMs",
  ]) {
    invariant(
      acknowledgement[field] === intent[field],
      `QA_CHECKPOINT_ACK ${field} mismatch`,
    );
  }
  invariant(
    acknowledgement.checkpointId === "browser_action_started",
    "QA_CHECKPOINT_ACK checkpointId mismatch",
  );
  requireHash(acknowledgement.targetLeaseHash, "targetLeaseHash");
  invariant(
    intent.targetLeaseHash === acknowledgement.targetLeaseHash,
    "QA_CHECKPOINT_ACK targetLeaseHash mismatch",
  );
  return true;
}

export function assertAuthenticationRecoveryLease(intent, delivery) {
  invariant(intent && typeof intent === "object", "recovery intent is required");
  invariant(
    delivery && typeof delivery === "object",
    "authentication recovery lease is required",
  );
  const expectedKeys = [
    "protocol",
    "runId",
    "sequence",
    "checkpointId",
    "channel",
    "targetLeaseHash",
  ];
  invariant(
    Object.keys(delivery).sort().join(",") ===
      [...expectedKeys].sort().join(","),
    "authentication recovery lease fields mismatch",
  );
  for (const field of ["protocol", "runId", "sequence", "channel"]) {
    invariant(
      delivery[field] === intent[field],
      `authentication recovery lease ${field} mismatch`,
    );
  }
  invariant(
    delivery.checkpointId === "authentication_recovery_target",
    "authentication recovery lease checkpointId mismatch",
  );
  requireHash(delivery.targetLeaseHash, "targetLeaseHash");
  invariant(
    intent.targetLeaseHash === delivery.targetLeaseHash,
    "authentication recovery lease targetLeaseHash mismatch",
  );
  return true;
}

const CHANNELS = new Set([
  "facebook",
  "instagram",
  "linkedin",
  "x",
  "tiktok",
  "youtube",
  "pinterest",
]);

function clone(value) {
  return structuredClone(value);
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireActor(event, actor) {
  invariant(event.actor === actor, `${event.type} must be recorded by ${actor}`);
}

function requireHash(value, label) {
  invariant(
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    `${label} must be a SHA-256 hash`,
  );
}

function requireTaskId(value, label = "taskId") {
  invariant(
    typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value),
    `${label} must be a nonempty stable task identity`,
  );
}

function requireExactKeys(value, keys, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(","),
  `${label} fields mismatch`);
}

function authorizationIdForRun(runId) {
  return `${runId}:one-time-browser-access`;
}

function requireActiveRun(state) {
  invariant(state.terminal === null, "run is already terminal");
}

function requireActiveTask(state) {
  invariant(state.coordination.activeTask, "no active worker task");
  return state.coordination.activeTask;
}

function expectedChannel(state) {
  return state.run.channels.find(
    (channel) => !state.protocol.completedChannels.includes(channel),
  );
}

function consumeAuthorization(state) {
  state.authorization.browserAccessAuthorized = false;
  state.authorization.consumed = true;
}

function closeActiveTask(state, reason) {
  if (!state.coordination.activeTask) return;
  const active = state.coordination.activeTask;
  state.coordination.taskHistory.push({
    ...active,
    status: "terminal",
    reason,
  });
  if (
    state.coordination.continuation?.state === "active" &&
    state.coordination.continuation.taskId === active.taskId
  ) {
    state.coordination.continuation.state = "closed";
    state.coordination.continuationHistory[
      state.coordination.continuationHistory.length - 1
    ] = clone(state.coordination.continuation);
  }
  state.coordination.activeTask = null;
}

function stopRun(state, reason) {
  if (state.terminal) return state;
  closeActiveTask(state, reason);
  const checkpoint = state.protocol.pending
    ? clone(state.protocol.pending)
    : null;
  state.protocol.pending = null;
  state.terminal = {
    resultId: "run_stopped",
    reason,
    disposition: "blocked",
    blockingProductFinding: false,
    resumeSupported: false,
    emitted: false,
    checkpoint,
  };
  consumeAuthorization(state);
  return state;
}

function checkpointIsRecoverable(state) {
  const pending = state.protocol.pending;
  if (!pending) return { ok: true, resumeAt: "next_event" };
  if (
    pending.action?.state === "started" &&
    pending.action.target?.state === "recreation_required"
  ) {
    return { ok: true, resumeAt: "recreate_target_from_official_root" };
  }
  if (pending.action?.state === "started") {
    return { ok: false, reason: "ambiguous_browser_action" };
  }
  if (pending.result?.state === "persisted") {
    return { ok: true, resumeAt: "emit_persisted_result" };
  }
  if (pending.action?.state === "completed") {
    return { ok: true, resumeAt: "persist_channel_result" };
  }
  if (pending.response.state === "accepted") {
    return { ok: true, resumeAt: "accepted_response" };
  }
  if (pending.response.state === "sent") {
    return { ok: true, resumeAt: "accept_persisted_response" };
  }
  if (pending.response.state === "persisted") {
    return { ok: true, resumeAt: "send_persisted_response" };
  }
  return { ok: true, resumeAt: "answer_observed_request" };
}

export function createQaManagerRunState(spec) {
  invariant(spec && typeof spec === "object", "run spec is required");
  for (const field of [
    "runId",
    "scenarioId",
    "scenarioSha256",
    "oracleId",
    "oracleSha256",
    "protocolVersion",
    "protocolSha256",
    "browser",
  ]) {
    invariant(
      typeof spec[field] === "string" && spec[field].length > 0,
      `${field} is required`,
    );
  }
  invariant(
    spec.browser === "chrome" || spec.browser === "in_app",
    "browser must be chrome or in_app",
  );
  for (const field of [
    "scenarioSha256",
    "oracleSha256",
    "protocolSha256",
  ]) {
    requireHash(spec[field], field);
  }
  const authorizationId = authorizationIdForRun(spec.runId);
  if (spec.authorizationId !== undefined) {
    invariant(
      spec.authorizationId === authorizationId,
      "authorizationId must be deterministically bound to runId",
    );
  }
  invariant(
    Array.isArray(spec.channels) && spec.channels.length > 0,
    "channels must be a nonempty ordered list",
  );
  invariant(
    new Set(spec.channels).size === spec.channels.length,
    "channels must be unique",
  );
  invariant(
    spec.channels.every((channel) => CHANNELS.has(channel)),
    "channels contain an unsupported value",
  );
  let campaign = null;
  if (spec.campaignGrant !== undefined) {
    assertQaCampaignChildGrant(spec.campaignGrant);
    invariant(
      spec.campaignGrant.runId === spec.runId &&
        spec.campaignGrant.authorizationId === authorizationId &&
        spec.campaignGrant.scenarioId === spec.scenarioId &&
        spec.campaignGrant.scenarioSha256 === spec.scenarioSha256 &&
        spec.campaignGrant.oracleId === spec.oracleId &&
        spec.campaignGrant.oracleSha256 === spec.oracleSha256 &&
        spec.campaignGrant.protocolVersion === spec.protocolVersion &&
        spec.campaignGrant.protocolSha256 === spec.protocolSha256 &&
        spec.campaignGrant.browser === spec.browser &&
        JSON.stringify(spec.campaignGrant.channels) ===
          JSON.stringify(spec.channels) &&
        (spec.resolvedRunStatePath === undefined ||
          spec.campaignGrant.runStatePathSha256 ===
            qaCampaignPathSha256(spec.resolvedRunStatePath)),
      "campaign child grant does not exactly bind the run spec",
    );
    campaign = {
      campaignId: spec.campaignGrant.campaignId,
      campaignScopeSha256: spec.campaignGrant.campaignScopeSha256,
      ordinal: spec.campaignGrant.ordinal,
      grantSha256: spec.campaignGrant.grantSha256,
      pinsSha256: spec.campaignGrant.pinsSha256,
      runStatePathSha256: spec.campaignGrant.runStatePathSha256,
    };
  }

  return {
    schemaVersion: QA_RECOVERY_SCHEMA_VERSION,
    run: {
      runId: spec.runId,
      scenarioId: spec.scenarioId,
      scenarioSha256: spec.scenarioSha256,
      oracleId: spec.oracleId,
      oracleSha256: spec.oracleSha256,
      protocolVersion: spec.protocolVersion,
      protocolSha256: spec.protocolSha256,
      browser: spec.browser,
      channels: [...spec.channels],
    },
    campaign,
    authorization: {
      authorizationId,
      oneTime: true,
      browserAccessAuthorized: true,
      consumed: false,
    },
    protocol: {
      nextSequence: 1,
      pending: null,
      acceptedResponses: [],
      emittedResults: [],
      completedChannels: [],
    },
    coordination: {
      activeTask: null,
      taskHistory: [],
      handoff: null,
      continuation: null,
      continuationHistory: [],
      recoveryAttempts: 0,
      recoveryRetryLimit: QA_RECOVERY_RETRY_LIMIT,
    },
    terminal: null,
  };
}

function recordTaskTerminal(state, event) {
  requireActor(event, "manager");
  const active = requireActiveTask(state);
  invariant(
    !event.taskId || event.taskId === active.taskId,
    "terminal task identity does not match active task",
  );
  state.coordination.taskHistory.push({
    ...active,
    status: "terminal",
    reason: event.reason,
  });
  if (
    state.coordination.continuation?.state === "active" &&
    state.coordination.continuation.taskId === active.taskId
  ) {
    state.coordination.continuation.state = "closed";
    state.coordination.continuationHistory[
      state.coordination.continuationHistory.length - 1
    ] = clone(state.coordination.continuation);
  }
  if (
    state.protocol.pending?.action?.state === "binding_verified" ||
    state.protocol.pending?.action?.state === "start_persisted"
  ) {
    state.protocol.pending.action.state = "authorized";
    state.protocol.pending.action.bindingHash = null;
    state.protocol.pending.action.label = null;
    state.protocol.pending.action.hash = null;
    state.protocol.pending.action.timeoutMs = null;
  }
  if (
    state.protocol.pending?.action?.state === "started" &&
    state.protocol.pending.action.target?.state === "authentication_handoff"
  ) {
    state.protocol.pending.action.target.state = "recreation_required";
    state.protocol.pending.action.target.leaseHash = null;
    state.protocol.pending.action.target.recoveryLeaseDeliveryState =
      "not_required";
  }
  state.coordination.activeTask = null;
}

function reserveContinuation(state, event) {
  requireActor(event, "manager");
  invariant(!state.coordination.activeTask, "active task must be terminal first");
  invariant(
    !state.coordination.continuation ||
      state.coordination.continuation.state === "closed",
    "a continuation lease already exists",
  );

  if (event.purpose === "post_install_execution") {
    invariant(
      state.coordination.handoff?.kind === "post_install_fresh_task",
      "post-install continuation requires a worker handoff",
    );
    invariant(
      !state.coordination.continuationHistory.some(
        (entry) => entry.purpose === "post_install_execution",
      ),
      "post-install continuation already used",
    );
  } else {
    invariant(event.purpose === "host_recovery", "invalid continuation purpose");
    const recovery = checkpointIsRecoverable(state);
    if (!recovery.ok) return stopRun(state, recovery.reason);
    if (
      state.coordination.recoveryAttempts >=
      state.coordination.recoveryRetryLimit
    ) {
      return stopRun(state, "worker_host_unavailable");
    }
    state.coordination.recoveryAttempts += 1;
  }

  const ordinal =
    state.coordination.continuationHistory.filter(
      (entry) => entry.purpose === event.purpose,
    ).length + 1;
  const lease = {
    key: `${state.run.runId}:${event.purpose}:${ordinal}`,
    purpose: event.purpose,
    state: "reserved",
    taskId: null,
    resumeAt:
      event.purpose === "host_recovery"
        ? checkpointIsRecoverable(state).resumeAt
        : "start_fresh_post_install_task",
  };
  state.coordination.continuation = lease;
  state.coordination.continuationHistory.push(clone(lease));
  return state;
}

function beginContinuationCreate(state, event) {
  requireActor(event, "manager");
  const lease = state.coordination.continuation;
  invariant(lease?.state === "reserved", "no reserved continuation lease");
  invariant(event.leaseKey === lease.key, "continuation lease key mismatch");
  lease.state = "creating";
  state.coordination.continuationHistory[
    state.coordination.continuationHistory.length - 1
  ] = clone(lease);
}

function activateContinuation(state, event) {
  requireActor(event, "manager");
  const lease = state.coordination.continuation;
  invariant(lease?.state === "creating", "no creating continuation lease");
  invariant(event.leaseKey === lease.key, "continuation lease key mismatch");
  requireTaskId(event.taskId, "confirmed continuation task identity");
  invariant(!state.coordination.activeTask, "another task is already active");
  invariant(
    !state.coordination.taskHistory.some((task) => task.taskId === event.taskId),
    "continuation task identity was already used",
  );
  lease.state = "active";
  lease.taskId = event.taskId;
  state.coordination.continuationHistory[
    state.coordination.continuationHistory.length - 1
  ] = clone(lease);
  state.coordination.activeTask = {
    taskId: event.taskId,
    purpose: lease.purpose,
    generation: state.coordination.taskHistory.length + 1,
    status: "active",
  };
  const pending = state.protocol.pending;
  if (
    pending?.action.state === "started" &&
    pending.action.target.state === "recreation_required"
  ) {
    pending.action.target.leaseHash = dedicatedTargetLeaseHash({
      runId: state.run.runId,
      taskId: event.taskId,
      channel: pending.channel,
      browser: state.run.browser,
      actionHash: pending.action.hash,
    });
    pending.action.target.recoveryLeaseDeliveryState = "pending";
  }
}

function applyActiveEvent(state, event) {
  switch (event.type) {
    case "activate_initial_task": {
      requireActor(event, "manager");
      requireTaskId(event.taskId);
      invariant(!state.coordination.activeTask, "another task is already active");
      invariant(
        state.coordination.taskHistory.length === 0,
        "initial task already existed",
      );
      state.coordination.activeTask = {
        taskId: event.taskId,
        purpose: "bootstrap",
        generation: 0,
        status: "active",
      };
      break;
    }
    case "worker_handoff": {
      requireActor(event, "worker");
      const active = requireActiveTask(state);
      invariant(active.purpose === "bootstrap", "only bootstrap may hand off");
      invariant(
        event.kind === "post_install_fresh_task",
        "unsupported worker handoff",
      );
      invariant(!state.coordination.handoff, "handoff already recorded");
      state.coordination.handoff = {
        kind: event.kind,
        sourceTaskId: active.taskId,
        nextSequence: state.protocol.nextSequence,
      };
      break;
    }
    case "task_terminal":
      recordTaskTerminal(state, event);
      break;
    case "reserve_continuation":
      return reserveContinuation(state, event);
    case "begin_continuation_create":
      beginContinuationCreate(state, event);
      break;
    case "activate_continuation":
      activateContinuation(state, event);
      break;
    case "continuation_create_failed": {
      requireActor(event, "manager");
      const lease = state.coordination.continuation;
      invariant(lease?.state === "creating", "no creating continuation lease");
      invariant(event.leaseKey === lease.key, "continuation lease key mismatch");
      invariant(
        event.outcome === "known_not_created" || event.outcome === "ambiguous",
        "invalid continuation creation outcome",
      );
      lease.state = event.outcome === "ambiguous" ? "ambiguous" : "closed";
      state.coordination.continuationHistory[
        state.coordination.continuationHistory.length - 1
      ] = clone(lease);
      return stopRun(
        state,
        event.outcome === "ambiguous"
          ? "continuation_creation_ambiguous"
          : "worker_host_unavailable",
      );
    }
    case "recover_manager_process": {
      requireActor(event, "manager");
      const lease = state.coordination.continuation;
      if (lease?.state === "creating") {
        lease.state = "ambiguous";
        state.coordination.continuationHistory[
          state.coordination.continuationHistory.length - 1
        ] = clone(lease);
        return stopRun(state, "continuation_creation_ambiguous");
      }
      break;
    }
    case "observe_request": {
      requireActor(event, "manager");
      requireActiveTask(state);
      invariant(state.protocol.pending === null, "a request is already pending");
      invariant(
        event.sequence === state.protocol.nextSequence,
        "request sequence is not the next expected sequence",
      );
      invariant(
        typeof event.requestId === "string" && event.requestId.length > 0,
        "requestId is required",
      );
      if (event.requestId === "channel_begin") {
        invariant(event.channel === expectedChannel(state), "channel is out of order");
      } else {
        invariant(event.channel === undefined, "non-channel request named a channel");
      }
      state.protocol.nextSequence += 1;
      state.protocol.pending = {
        sequence: event.sequence,
        requestId: event.requestId,
        channel: event.channel ?? null,
        eventHash: event.eventHash,
        response: { state: "none", hash: null },
        action: {
          state:
            event.requestId === "channel_begin" ? "not_authorized" : "not_required",
          bindingHash: null,
          label: null,
          hash: null,
          timeoutMs: null,
          outcomeHash: null,
          acknowledgementState: "not_ready",
          target: {
            ownership: QA_DEDICATED_TARGET_OWNERSHIP,
            state: "not_created",
            leaseHash: null,
            recoveryLeaseDeliveryState: "not_required",
          },
        },
        result: null,
      };
      requireHash(event.eventHash, "eventHash");
      break;
    }
    case "persist_response": {
      requireActor(event, "manager");
      const pending = state.protocol.pending;
      invariant(pending?.response.state === "none", "response already persisted");
      invariant(event.sequence === pending.sequence, "response sequence mismatch");
      requireHash(event.responseHash, "responseHash");
      pending.response = { state: "persisted", hash: event.responseHash };
      break;
    }
    case "mark_response_sent": {
      requireActor(event, "manager");
      const pending = state.protocol.pending;
      invariant(
        pending?.response.state === "persisted",
        "response must be persisted before sending",
      );
      invariant(event.responseHash === pending.response.hash, "response hash mismatch");
      pending.response.state = "sent";
      break;
    }
    case "accept_response": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      invariant(
        pending?.response.state === "sent",
        "only a sent response may be accepted",
      );
      invariant(event.responseHash === pending.response.hash, "response hash mismatch");
      pending.response.state = "accepted";
      state.protocol.acceptedResponses.push({
        sequence: pending.sequence,
        requestId: pending.requestId,
        responseHash: pending.response.hash,
      });
      if (pending.requestId === "channel_begin") {
        pending.action.state = "authorized";
      } else {
        state.protocol.pending = null;
      }
      break;
    }
    case "verify_browser_binding": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      invariant(
        pending?.requestId === "channel_begin",
        "browser binding verification requires channel_begin",
      );
      invariant(pending.action.state === "authorized", "action is not authorized");
      invariant(event.channel === pending.channel, "binding channel mismatch");
      invariant(event.browser === state.run.browser, "binding browser mismatch");
      requireHash(event.bindingHash, "bindingHash");
      pending.action.state = "binding_verified";
      pending.action.bindingHash = event.bindingHash;
      break;
    }
    case "start_browser_action": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      invariant(
        pending?.requestId === "channel_begin",
        "browser action requires channel_begin",
      );
      invariant(
        pending.action.state === "binding_verified",
        "browser binding is not verified",
      );
      requireHash(pending.action.bindingHash, "bindingHash");
      invariant(event.channel === pending.channel, "action channel mismatch");
      invariant(event.browser === state.run.browser, "action browser mismatch");
      invariant(event.action === QA_BROWSER_ACTION, "browser action label mismatch");
      requireHash(event.actionHash, "actionHash");
      invariant(
        event.timeoutMs === QA_BROWSER_ACTION_TIMEOUT_MS,
        `browser action timeout must be ${QA_BROWSER_ACTION_TIMEOUT_MS} ms`,
      );
      invariant(
        event.actionHash === browserActionDescriptorHash(event),
        "action hash does not match the canonical descriptor",
      );
      pending.action.state = "start_persisted";
      pending.action.label = event.action;
      pending.action.hash = event.actionHash;
      pending.action.timeoutMs = event.timeoutMs;
      break;
    }
    case "authorize_browser_action_start": {
      requireActor(event, "manager");
      const pending = state.protocol.pending;
      const active = requireActiveTask(state);
      invariant(
        pending?.requestId === "channel_begin",
        "browser action requires channel_begin",
      );
      invariant(
        pending.action.state === "start_persisted",
        "browser action start must be persisted before acknowledgement",
      );
      invariant(event.channel === pending.channel, "action channel mismatch");
      invariant(event.browser === state.run.browser, "action browser mismatch");
      invariant(event.action === pending.action.label, "browser action label mismatch");
      invariant(event.actionHash === pending.action.hash, "action hash mismatch");
      invariant(
        event.timeoutMs === pending.action.timeoutMs,
        "browser action timeout mismatch",
      );
      pending.action.target.leaseHash = dedicatedTargetLeaseHash({
        runId: state.run.runId,
        taskId: active.taskId,
        channel: pending.channel,
        browser: state.run.browser,
        actionHash: pending.action.hash,
      });
      pending.action.state = "started";
      pending.action.acknowledgementState = "pending";
      break;
    }
    case "record_target_created":
    case "recreate_target_after_authentication": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      requireActiveTask(state);
      invariant(pending?.action.state === "started", "action was not started");
      const expectedState =
        event.type === "record_target_created"
          ? "not_created"
          : "recreation_required";
      invariant(
        pending.action.target.state === expectedState,
        `target must be ${expectedState}`,
      );
      invariant(
        event.type === "record_target_created"
          ? pending.action.acknowledgementState === "issued"
          : pending.action.target.recoveryLeaseDeliveryState === "issued",
        event.type === "record_target_created"
          ? "initial acknowledgement was not durably issued"
          : "authentication recovery lease was not durably issued",
      );
      invariant(event.channel === pending.channel, "target channel mismatch");
      invariant(event.browser === state.run.browser, "target browser mismatch");
      invariant(
        event.officialRoot === OFFICIAL_ROOTS[pending.channel],
        "target root does not match the typed official root",
      );
      requireHash(event.leaseHash, "leaseHash");
      invariant(
        event.leaseHash === pending.action.target.leaseHash,
        "lease hash does not match the manager-supplied target lease",
      );
      pending.action.target.state = "created";
      pending.action.target.recoveryLeaseDeliveryState = "not_required";
      break;
    }
    case "mark_authentication_handoff": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      requireActiveTask(state);
      invariant(pending?.action.state === "started", "action was not started");
      invariant(
        pending.action.target.state === "created",
        "authentication handoff requires a live dedicated target",
      );
      invariant(
        event.leaseHash === pending.action.target.leaseHash,
        "authentication handoff lease mismatch",
      );
      pending.action.target.state = "authentication_handoff";
      break;
    }
    case "resume_target_after_authentication": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      requireActiveTask(state);
      invariant(pending?.action.state === "started", "action was not started");
      invariant(
        pending.action.target.state === "authentication_handoff",
        "no same-task authentication handoff exists",
      );
      invariant(
        event.leaseHash === pending.action.target.leaseHash,
        "authentication resume lease mismatch",
      );
      pending.action.target.state = "created";
      break;
    }
    case "release_target": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      requireActiveTask(state);
      invariant(pending?.action.state === "started", "action was not started");
      invariant(
        pending.action.target.state === "created",
        "only a live dedicated target may be released",
      );
      invariant(
        event.leaseHash === pending.action.target.leaseHash,
        "target release lease mismatch",
      );
      pending.action.target.state = "released";
      break;
    }
    case "finalize_browser_action": {
      requireExactKeys(event, [
        "type",
        "actor",
        "channel",
        "browser",
        "officialRoot",
        "targetOwnership",
        "targetLifecycle",
        "leaseHash",
        "action",
        "actionHash",
        "timeoutMs",
        "outcomeHash",
      ], "finalize_browser_action");
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      requireActiveTask(state);
      invariant(pending?.action.state === "started", "action was not started");
      invariant(
        pending.action.target.state === "not_created",
        "atomic finalization requires an unreported initial target",
      );
      invariant(
        pending.action.acknowledgementState === "issued",
        "initial acknowledgement was not durably issued",
      );
      invariant(event.channel === pending.channel, "target channel mismatch");
      invariant(event.browser === state.run.browser, "target browser mismatch");
      invariant(
        event.officialRoot === OFFICIAL_ROOTS[pending.channel],
        "target root does not match the typed official root",
      );
      invariant(
        event.targetOwnership === QA_DEDICATED_TARGET_OWNERSHIP,
        "target ownership mismatch",
      );
      invariant(
        event.targetLifecycle === "released",
        "atomic finalization requires a released target",
      );
      requireHash(event.leaseHash, "leaseHash");
      invariant(
        event.leaseHash === pending.action.target.leaseHash,
        "target finalization lease mismatch",
      );
      invariant(event.action === QA_BROWSER_ACTION, "browser action label mismatch");
      invariant(event.actionHash === pending.action.hash, "action hash mismatch");
      invariant(
        event.timeoutMs === QA_BROWSER_ACTION_TIMEOUT_MS,
        `browser action timeout must be ${QA_BROWSER_ACTION_TIMEOUT_MS} ms`,
      );
      requireHash(event.outcomeHash, "outcomeHash");
      pending.action.target.state = "released";
      pending.action.state = "completed";
      pending.action.outcomeHash = event.outcomeHash;
      break;
    }
    case "complete_browser_action": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      invariant(pending?.action.state === "started", "action was not started");
      invariant(event.actionHash === pending.action.hash, "action hash mismatch");
      invariant(
        pending.action.target.state === "released",
        "dedicated target must be released before action completion",
      );
      requireHash(event.outcomeHash, "outcomeHash");
      pending.action.state = "completed";
      pending.action.outcomeHash = event.outcomeHash;
      break;
    }
    case "persist_channel_result": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      invariant(
        pending?.requestId === "channel_begin",
        "channel result requires channel_begin",
      );
      invariant(
        pending.action.state === "completed",
        "browser action must be durably completed first",
      );
      invariant(event.channel === pending.channel, "result channel mismatch");
      invariant(
        event.sequence === state.protocol.nextSequence,
        "result sequence is not the next expected sequence",
      );
      invariant(
        !state.protocol.completedChannels.includes(event.channel),
        "channel is already complete",
      );
      requireHash(event.resultHash, "resultHash");
      invariant(
        event.resultHash === pending.action.outcomeHash,
        "result hash does not match durable action outcome",
      );
      state.protocol.nextSequence += 1;
      pending.result = {
        state: "persisted",
        sequence: event.sequence,
        resultId: "channel_complete",
        hash: event.resultHash,
      };
      state.protocol.completedChannels.push(event.channel);
      break;
    }
    case "emit_persisted_result": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      invariant(pending?.result?.state === "persisted", "no persisted result");
      invariant(event.resultHash === pending.result.hash, "result hash mismatch");
      pending.result.state = "emitted";
      state.protocol.emittedResults.push({
        sequence: pending.result.sequence,
        resultId: pending.result.resultId,
        channel: pending.channel,
        resultHash: pending.result.hash,
      });
      state.protocol.pending = null;
      break;
    }
    case "run_complete": {
      requireActor(event, "manager");
      invariant(
        state.protocol.completedChannels.length === state.run.channels.length,
        "not every selected channel is complete",
      );
      invariant(state.protocol.pending === null, "run has pending protocol work");
      invariant(
        state.protocol.emittedResults.length === state.run.channels.length,
        "not every channel result was emitted",
      );
      invariant(
        event.disposition === undefined ||
          event.disposition === "pass" ||
          event.disposition === "pass_with_findings" ||
          event.disposition === "fail",
        "invalid complete disposition",
      );
      const disposition = event.disposition ?? "pass";
      invariant(
        disposition === "fail"
          ? event.blockingProductFinding === true
          : event.blockingProductFinding === undefined ||
            event.blockingProductFinding === false,
        "blockingProductFinding must be true only for a failing complete run",
      );
      requireActiveTask(state);
      closeActiveTask(state, "run_complete");
      state.terminal = {
        resultId: "run_complete",
        reason: null,
        disposition,
        blockingProductFinding: disposition === "fail",
        resumeSupported: false,
        emitted: false,
        checkpoint: null,
      };
      consumeAuthorization(state);
      break;
    }
    case "stop_run": {
      requireActor(event, "manager");
      return stopRun(state, event.reason);
    }
    default:
      throw new Error(`unknown recovery event: ${event.type}`);
  }
  return state;
}

export function applyQaRecoveryEvent(inputState, event) {
  assertQaManagerRunState(inputState);
  const state = clone(inputState);
  invariant(
    state.schemaVersion === QA_RECOVERY_SCHEMA_VERSION,
    "unsupported recovery state schema",
  );
  invariant(event && typeof event.type === "string", "event type is required");

  if (state.terminal) {
    if (event.type === "emit_terminal") {
      requireActor(event, "manager");
      if (!state.terminal.emitted) state.terminal.emitted = true;
      return state;
    }
    if (event.type === "stop_run") return state;
    throw new Error("run is already terminal");
  }
  requireActiveRun(state);
  return applyActiveEvent(state, event);
}

export function recoveryCheckpoint(state) {
  return clone(checkpointIsRecoverable(state));
}

export function assertQaManagerRunState(state) {
  invariant(
    state?.schemaVersion === QA_RECOVERY_SCHEMA_VERSION,
    "unsupported recovery state schema",
  );
  requireExactKeys(state, ["schemaVersion", "run", "campaign", "authorization", "protocol", "coordination", "terminal"], "run state");
  requireExactKeys(state.run, ["runId", "scenarioId", "scenarioSha256", "oracleId", "oracleSha256", "protocolVersion", "protocolSha256", "browser", "channels"], "run state run");
  requireExactKeys(state.authorization, ["authorizationId", "oneTime", "browserAccessAuthorized", "consumed"], "run state authorization");
  requireExactKeys(state.protocol, ["nextSequence", "pending", "acceptedResponses", "emittedResults", "completedChannels"], "run state protocol");
  requireExactKeys(state.coordination, ["activeTask", "taskHistory", "handoff", "continuation", "continuationHistory", "recoveryAttempts", "recoveryRetryLimit"], "run state coordination");
  invariant(Array.isArray(state.run.channels) && state.run.channels.every((channel) => CHANNELS.has(channel)), "run state channels are invalid");
  invariant(Number.isInteger(state.protocol.nextSequence) && state.protocol.nextSequence >= 1, "run state nextSequence is invalid");
  invariant(Array.isArray(state.protocol.acceptedResponses) && Array.isArray(state.protocol.emittedResults), "run state protocol histories are invalid");
  invariant(Array.isArray(state.protocol.completedChannels), "run state completed channels are invalid");
  invariant(Array.isArray(state.coordination.taskHistory), "run state task history is invalid");
  invariant(Array.isArray(state.coordination.continuationHistory), "run state continuation history is invalid");
  if (state.terminal !== null) requireExactKeys(state.terminal, ["resultId", "reason", "disposition", "blockingProductFinding", "resumeSupported", "emitted", "checkpoint"], "run state terminal");
  invariant(
    state.authorization?.oneTime === true,
    "browser authorization must be one-time",
  );
  invariant(
    state.authorization.authorizationId ===
      authorizationIdForRun(state.run?.runId),
    "browser authorization is not bound to runId",
  );
  invariant(
    typeof state.run?.runId === "string" && state.run.runId.length > 0,
    "runId is required",
  );
  if (state.campaign !== null) {
    requireExactKeys(state.campaign, ["campaignId", "campaignScopeSha256", "ordinal", "grantSha256", "pinsSha256", "runStatePathSha256"], "run state campaign");
    requireTaskId(state.campaign?.campaignId, "campaignId");
    requireHash(state.campaign?.campaignScopeSha256, "campaignScopeSha256");
    invariant(
      Number.isInteger(state.campaign?.ordinal) &&
        state.campaign.ordinal >= 1 &&
        state.campaign.ordinal <= 10,
      "campaign child ordinal is invalid",
    );
    requireHash(state.campaign?.grantSha256, "grantSha256");
    requireHash(state.campaign?.pinsSha256, "pinsSha256");
    requireHash(state.campaign?.runStatePathSha256, "runStatePathSha256");
  }
  for (const task of state.coordination.taskHistory) requireExactKeys(task, ["taskId", "purpose", "generation", "status", "reason"], "run state historical task");
  if (state.coordination.activeTask) requireExactKeys(state.coordination.activeTask, ["taskId", "purpose", "generation", "status"], "run state active task");
  for (const lease of state.coordination.continuationHistory) requireExactKeys(lease, ["key", "purpose", "state", "taskId", "resumeAt"], "run state continuation");
  if (state.coordination.continuation) requireExactKeys(state.coordination.continuation, ["key", "purpose", "state", "taskId", "resumeAt"], "run state continuation");
  if (state.coordination.handoff) requireExactKeys(state.coordination.handoff, ["kind", "sourceTaskId", "nextSequence"], "run state handoff");
  for (const response of state.protocol.acceptedResponses) requireExactKeys(response, ["sequence", "requestId", "responseHash"], "run state accepted response");
  for (const result of state.protocol.emittedResults) requireExactKeys(result, ["sequence", "resultId", "channel", "resultHash"], "run state emitted result");
  if (state.protocol.pending) {
    const pending = state.protocol.pending;
    requireExactKeys(pending, ["sequence", "requestId", "channel", "eventHash", "response", "action", "result"], "run state pending");
    requireExactKeys(pending.response, ["state", "hash"], "run state pending response");
    requireExactKeys(pending.action, ["state", "bindingHash", "label", "hash", "timeoutMs", "outcomeHash", "acknowledgementState", "target"], "run state pending action");
    requireExactKeys(pending.action.target, ["ownership", "state", "leaseHash", "recoveryLeaseDeliveryState"], "run state pending target");
    if (pending.result) requireExactKeys(pending.result, ["state", "sequence", "resultId", "hash"], "run state pending result");
  }
  for (const [label, value] of [
    ["scenarioSha256", state.run?.scenarioSha256],
    ["oracleSha256", state.run?.oracleSha256],
    ["protocolSha256", state.run?.protocolSha256],
  ]) {
    requireHash(value, label);
  }
  invariant(
    state.coordination?.recoveryRetryLimit === QA_RECOVERY_RETRY_LIMIT,
    "recovery retry limit must remain one",
  );
  invariant(
    Number.isInteger(state.coordination.recoveryAttempts) &&
      state.coordination.recoveryAttempts >= 0 &&
      state.coordination.recoveryAttempts <= QA_RECOVERY_RETRY_LIMIT,
    "recovery retry limit exceeded",
  );
  invariant(
    new Set(state.protocol.completedChannels).size ===
      state.protocol.completedChannels.length,
    "completed channels contain duplicates",
  );
  invariant(
    state.protocol.completedChannels.every((channel) =>
      state.run.channels.includes(channel),
    ),
    "completed channel was not selected",
  );
  const action = state.protocol.pending?.action;
  if (action) {
    const hasStartDescriptor = [
      "start_persisted",
      "started",
      "completed",
    ].includes(action.state);
    if (hasStartDescriptor) {
      invariant(action.label === QA_BROWSER_ACTION, "browser action label mismatch");
      requireHash(action.hash, "actionHash");
      invariant(
        action.timeoutMs === QA_BROWSER_ACTION_TIMEOUT_MS,
        "browser action timeout mismatch",
      );
    } else {
      invariant(action.label === null, "unstarted action must not have a label");
      invariant(action.hash === null, "unstarted action must not have a hash");
      invariant(
        action.timeoutMs === null,
        "unstarted action must not have a timeout",
      );
    }
    invariant(
      ["not_ready", "pending", "issued"].includes(
        action.acknowledgementState,
      ),
      "invalid acknowledgement issuance state",
    );
    if (action.state === "started" || action.state === "completed") {
      invariant(
        ["pending", "issued"].includes(action.acknowledgementState),
        "started action lacks acknowledgement issuance state",
      );
    } else {
      invariant(
        action.acknowledgementState === "not_ready",
        "unstarted action retained acknowledgement issuance state",
      );
    }
    invariant(
      action.target?.ownership === QA_DEDICATED_TARGET_OWNERSHIP,
      "dedicated target ownership mismatch",
    );
    invariant(
      [
        "not_created",
        "created",
        "authentication_handoff",
        "recreation_required",
        "released",
      ].includes(action.target.state),
      "invalid dedicated target lifecycle state",
    );
    invariant(
      ["not_required", "pending", "issued"].includes(
        action.target.recoveryLeaseDeliveryState,
      ),
      "invalid authentication recovery lease delivery state",
    );
    if (action.target.state === "recreation_required") {
      invariant(
        action.target.leaseHash === null
          ? action.target.recoveryLeaseDeliveryState === "not_required"
          : ["pending", "issued"].includes(
              action.target.recoveryLeaseDeliveryState,
            ),
        "authentication recovery lease delivery state is inconsistent",
      );
    } else {
      invariant(
        action.target.recoveryLeaseDeliveryState === "not_required",
        "non-recovery target retained recovery lease delivery state",
      );
    }
    if (
      ["created", "authentication_handoff", "released"].includes(
        action.target.state,
      ) ||
      (action.state === "started" && action.target.state === "not_created") ||
      (action.target.state === "recreation_required" &&
        action.target.leaseHash !== null)
    ) {
      requireHash(action.target.leaseHash, "leaseHash");
    } else {
      invariant(
        action.target.leaseHash === null,
        "inactive dedicated target must not retain a lease hash",
      );
    }
    if (action.state === "completed") {
      invariant(
        action.target.state === "released",
        "completed action retained an unreleased dedicated target",
      );
    }
  }
  const history = state.coordination.continuationHistory;
  invariant(Array.isArray(history), "continuation history is required");
  invariant(
    new Set(history.map((entry) => entry.key)).size === history.length,
    "continuation history contains duplicate lease keys",
  );
  invariant(
    history.filter((entry) =>
      ["reserved", "creating", "active"].includes(entry.state),
    ).length <= 1,
    "continuation history contains multiple live entries",
  );
  if (state.coordination.continuation) {
    const latest = history.at(-1);
    invariant(
      latest &&
        JSON.stringify(latest) ===
          JSON.stringify(state.coordination.continuation),
      "current continuation does not match history",
    );
  }
  const tasks = [
    ...state.coordination.taskHistory,
    ...(state.coordination.activeTask
      ? [state.coordination.activeTask]
      : []),
  ];
  tasks.forEach((task) => requireTaskId(task.taskId));
  invariant(
    new Set(tasks.map((task) => task.taskId)).size === tasks.length,
    "task history contains duplicate task identities",
  );
  const activeHistory = tasks.filter((task) => task.status === "active");
  invariant(
    activeHistory.length <= 1,
    "task history contains multiple active tasks",
  );
  if (state.coordination.activeTask) {
    invariant(
      state.coordination.activeTask.status === "active",
      "active task has a terminal status",
    );
  }
  if (state.terminal) {
    invariant(state.authorization.consumed, "terminal run retained authorization");
    invariant(
      !state.authorization.browserAccessAuthorized,
      "terminal run retained browser access",
    );
    invariant(
      state.coordination.activeTask === null,
      "terminal run retained an active task",
    );
    invariant(state.protocol.pending === null, "terminal run retained pending work");
    invariant(
      !state.coordination.continuation ||
        !["reserved", "creating", "active"].includes(
          state.coordination.continuation.state,
        ),
      "terminal run retained a live continuation",
    );
  }
  return true;
}

async function writeJsonAtomic(path, value) {
  const absolute = resolve(path);
  const temporary = resolve(
    dirname(absolute),
    `.${fileURLToPath(import.meta.url).split("/").at(-1)}-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, absolute);
}

async function writeJsonExclusive(path, value) {
  const absolute = resolve(path);
  const temporary = resolve(
    dirname(absolute),
    `.${fileURLToPath(import.meta.url).split("/").at(-1)}-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await link(temporary, absolute);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

const MUTATION_COMMANDS = new Set([
  "apply",
  "issue-ack",
  "issue-auth-recovery",
]);
const MUTATION_CLAIM_WAIT_MS = 2_000;
const MUTATION_CLAIM_RETRY_MS = 5;

export function qaMutationClaimPath(statePath) {
  const absoluteStatePath = resolve(statePath);
  const pathHash = createHash("sha256")
    .update(JSON.stringify({ statePath: absoluteStatePath }))
    .digest("hex");
  return resolve(dirname(absoluteStatePath), `.qa-mutation-${pathHash}.claim`);
}

export function qaIssuanceClaimPath(statePath, command) {
  invariant(MUTATION_COMMANDS.has(command), "invalid mutation command");
  return qaMutationClaimPath(statePath);
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export async function acquireQaMutationClaim(statePath, command) {
  invariant(MUTATION_COMMANDS.has(command), "invalid mutation command");
  const claimPath = qaMutationClaimPath(statePath);
  const claim = JSON.stringify({
    schemaVersion: "qa-issuance-claim/v1",
    nonce: randomUUID(),
  });
  const waitDeadline = Date.now() + MUTATION_CLAIM_WAIT_MS;
  let handle;
  while (!handle) {
    try {
      handle = await open(claimPath, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() >= waitDeadline) {
        throw new Error(
          "saved-state mutation claim is unavailable; ownership is ambiguous",
        );
      }
      await wait(MUTATION_CLAIM_RETRY_MS);
    }
  }
  try {
    await handle.writeFile(`${claim}\n`, "utf8");
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  }

  let released = false;
  return {
    path: claimPath,
    async release() {
      invariant(!released, "issuance claim was already released");
      const savedClaim = await readFile(claimPath, "utf8");
      invariant(
        savedClaim === `${claim}\n`,
        "issuance claim ownership is uncertain",
      );
      await unlink(claimPath);
      released = true;
    },
  };
}

export async function acquireQaIssuanceClaim(statePath, command) {
  return acquireQaMutationClaim(statePath, command);
}

async function mutateSavedState(statePath, command, mutate) {
  const claim = await acquireQaMutationClaim(statePath, command);
  let persistenceStarted = false;
  try {
    const state = parseQaStrictJson(await readFile(resolve(statePath), "utf8"), "run state");
    const mutation = mutate(state);
    persistenceStarted = true;
    await writeJsonAtomic(statePath, mutation.state);
    await claim.release();
    return mutation.output;
  } catch (error) {
    if (!persistenceStarted) {
      await claim.release().catch(() => {});
    }
    throw error;
  }
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

export async function runQaRecoveryCli(argv) {
  const { command, options } = parseArguments(argv);
  invariant(options.state, "--state is required");
  if (command === "create") {
    invariant(options.spec, "--spec is required");
    const spec = {
      ...parseQaStrictJson(await readFile(resolve(options.spec), "utf8"), "run spec"),
      resolvedRunStatePath: resolve(options.state),
    };
    const state = createQaManagerRunState(spec);
    assertQaManagerRunState(state);
    await writeJsonExclusive(options.state, state);
    return { ok: true, schemaVersion: state.schemaVersion, runId: state.run.runId };
  }
  if (command === "apply") {
    invariant(options.event, "--event is required");
    const event = parseQaStrictJson(await readFile(resolve(options.event), "utf8"), "run event");
    return mutateSavedState(options.state, command, (state) => {
      const next = applyQaRecoveryEvent(state, event);
      assertQaManagerRunState(next);
      return {
        state: next,
        output: {
          ok: true,
          runId: next.run.runId,
          nextSequence: next.protocol.nextSequence,
          terminal: next.terminal?.resultId ?? null,
        },
      };
    });
  }
  if (command === "issue-ack") {
    return mutateSavedState(options.state, command, (state) => {
      const issuance = issueQaCheckpointAck(state);
      return { state: issuance.state, output: issuance.acknowledgement };
    });
  }
  if (command === "issue-auth-recovery") {
    return mutateSavedState(options.state, command, (state) => {
      const issuance = issueAuthenticationRecoveryLease(state);
      return { state: issuance.state, output: issuance.delivery };
    });
  }
  if (command === "check") {
    const state = parseQaStrictJson(await readFile(resolve(options.state), "utf8"), "run state");
    assertQaManagerRunState(state);
    return {
      ok: true,
      runId: state.run.runId,
      nextSequence: state.protocol.nextSequence,
      terminal: state.terminal?.resultId ?? null,
    };
  }
  throw new Error(
    "command must be create, apply, issue-ack, issue-auth-recovery, or check",
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runQaRecoveryCli(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
