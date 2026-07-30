#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { link, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
          target: {
            ownership: QA_DEDICATED_TARGET_OWNERSHIP,
            state: "not_created",
            leaseHash: null,
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
      pending.action.state = "started";
      break;
    }
    case "record_target_created":
    case "recreate_target_after_authentication": {
      requireActor(event, "worker");
      const pending = state.protocol.pending;
      const active = requireActiveTask(state);
      invariant(pending?.action.state === "started", "action was not started");
      const expectedState =
        event.type === "record_target_created"
          ? "not_created"
          : "recreation_required";
      invariant(
        pending.action.target.state === expectedState,
        `target must be ${expectedState}`,
      );
      invariant(event.channel === pending.channel, "target channel mismatch");
      invariant(event.browser === state.run.browser, "target browser mismatch");
      invariant(
        event.officialRoot === OFFICIAL_ROOTS[pending.channel],
        "target root does not match the typed official root",
      );
      requireHash(event.leaseHash, "leaseHash");
      invariant(
        event.leaseHash === dedicatedTargetLeaseHash({
          runId: state.run.runId,
          taskId: active.taskId,
          channel: pending.channel,
          browser: state.run.browser,
          actionHash: pending.action.hash,
        }),
        "lease hash does not match the task-scoped target descriptor",
      );
      pending.action.target.state = "created";
      pending.action.target.leaseHash = event.leaseHash;
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
          event.disposition === "pass_with_findings",
        "invalid complete disposition",
      );
      requireActiveTask(state);
      closeActiveTask(state, "run_complete");
      state.terminal = {
        resultId: "run_complete",
        reason: null,
        disposition: event.disposition ?? "pass",
        blockingProductFinding: false,
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
    if (["created", "authentication_handoff", "released"].includes(action.target.state)) {
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
    const spec = JSON.parse(await readFile(resolve(options.spec), "utf8"));
    const state = createQaManagerRunState(spec);
    assertQaManagerRunState(state);
    await writeJsonExclusive(options.state, state);
    return { ok: true, schemaVersion: state.schemaVersion, runId: state.run.runId };
  }
  if (command === "apply") {
    invariant(options.event, "--event is required");
    const [state, event] = await Promise.all([
      readFile(resolve(options.state), "utf8").then(JSON.parse),
      readFile(resolve(options.event), "utf8").then(JSON.parse),
    ]);
    const next = applyQaRecoveryEvent(state, event);
    assertQaManagerRunState(next);
    await writeJsonAtomic(options.state, next);
    return {
      ok: true,
      runId: next.run.runId,
      nextSequence: next.protocol.nextSequence,
      terminal: next.terminal?.resultId ?? null,
    };
  }
  if (command === "check") {
    const state = JSON.parse(await readFile(resolve(options.state), "utf8"));
    assertQaManagerRunState(state);
    return {
      ok: true,
      runId: state.run.runId,
      nextSequence: state.protocol.nextSequence,
      terminal: state.terminal?.resultId ?? null,
    };
  }
  throw new Error("command must be create, apply, or check");
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
