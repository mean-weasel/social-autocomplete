import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  applyQaRecoveryEvent,
  assertQaManagerRunState,
  browserActionDescriptorHash,
  createQaManagerRunState,
  dedicatedTargetLeaseHash,
  QA_BROWSER_ACTION,
  QA_BROWSER_ACTION_TIMEOUT_MS,
  QA_RECOVERY_RETRY_LIMIT,
  recoveryCheckpoint,
  runQaRecoveryCli,
} from "../../scripts/browser-acceptance/qa-recovery.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const ACTION_HASH = browserActionDescriptorHash({
  channel: "instagram",
  browser: "chrome",
});

function spec() {
  return {
    runId: "qa_recovery_fixture",
    scenarioId: "three_channel_fixture",
    scenarioSha256: HASH_A,
    oracleId: "chrome_fixture",
    oracleSha256: HASH_B,
    protocolVersion: "qa-manager-worker/v1",
    protocolSha256: HASH_C,
    browser: "chrome",
    channels: ["instagram", "facebook", "linkedin"],
    authorizationId: "qa_recovery_fixture:one-time-browser-access",
  };
}

function apply(state, event) {
  return applyQaRecoveryEvent(state, event);
}

function executionState(runSpec = spec()) {
  let state = createQaManagerRunState(runSpec);
  state = apply(state, {
    type: "activate_initial_task",
    actor: "manager",
    taskId: "bootstrap-1",
  });
  state = apply(state, {
    type: "worker_handoff",
    actor: "worker",
    kind: "post_install_fresh_task",
  });
  state = apply(state, {
    type: "task_terminal",
    actor: "manager",
    taskId: "bootstrap-1",
    reason: "handoff_complete",
  });
  state = apply(state, {
    type: "reserve_continuation",
    actor: "manager",
    purpose: "post_install_execution",
  });
  const leaseKey = state.coordination.continuation.key;
  state = apply(state, {
    type: "begin_continuation_create",
    actor: "manager",
    leaseKey,
  });
  state = apply(state, {
    type: "activate_continuation",
    actor: "manager",
    leaseKey,
    taskId: "execution-1",
  });
  return state;
}

function observeChannel(state, channel = "instagram") {
  return apply(state, {
    type: "observe_request",
    actor: "manager",
    sequence: state.protocol.nextSequence,
    requestId: "channel_begin",
    channel,
    eventHash: HASH_A,
  });
}

function persistAndSend(state) {
  const sequence = state.protocol.pending.sequence;
  state = apply(state, {
    type: "persist_response",
    actor: "manager",
    sequence,
    responseHash: HASH_B,
  });
  return apply(state, {
    type: "mark_response_sent",
    actor: "manager",
    responseHash: HASH_B,
  });
}

function acceptAndStart(state) {
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  state = apply(state, {
    type: "verify_browser_binding",
    actor: "worker",
    channel: state.protocol.pending.channel,
    browser: state.run.browser,
    bindingHash: HASH_D,
  });
  state = apply(state, {
    type: "start_browser_action",
    actor: "worker",
    channel: state.protocol.pending.channel,
    browser: state.run.browser,
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  state = apply(state, {
    type: "authorize_browser_action_start",
    actor: "manager",
    channel: state.protocol.pending.channel,
    browser: state.run.browser,
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  const leaseHash = dedicatedTargetLeaseHash({
    runId: state.run.runId,
    taskId: state.coordination.activeTask.taskId,
    channel: state.protocol.pending.channel,
    browser: state.run.browser,
    actionHash: ACTION_HASH,
  });
  return apply(state, {
    type: "record_target_created",
    actor: "worker",
    channel: state.protocol.pending.channel,
    browser: state.run.browser,
    officialRoot: "https://www.instagram.com/",
    leaseHash,
  });
}

function completeAndPersistResult(state) {
  state = apply(state, {
    type: "release_target",
    actor: "worker",
    leaseHash: state.protocol.pending.action.target.leaseHash,
  });
  state = apply(state, {
    type: "complete_browser_action",
    actor: "worker",
    actionHash: ACTION_HASH,
    outcomeHash: HASH_D,
  });
  return apply(state, {
    type: "persist_channel_result",
    actor: "worker",
    sequence: state.protocol.nextSequence,
    channel: state.protocol.pending.channel,
    resultHash: HASH_D,
  });
}

function terminalHostFailure(state, taskId = "execution-1") {
  return apply(state, {
    type: "task_terminal",
    actor: "manager",
    taskId,
    reason: "system_error",
  });
}

function reserveRecovery(state) {
  return apply(state, {
    type: "reserve_continuation",
    actor: "manager",
    purpose: "host_recovery",
  });
}

test("durable state preserves immutable run identity and one-time authorization", () => {
  const state = createQaManagerRunState(spec());
  assert.deepEqual(state.run.channels, ["instagram", "facebook", "linkedin"]);
  assert.equal(state.run.browser, "chrome");
  assert.equal(state.coordination.recoveryRetryLimit, 1);
  assert.equal(QA_RECOVERY_RETRY_LIMIT, 1);
  assert.equal(state.authorization.oneTime, true);
  assert.equal(state.authorization.browserAccessAuthorized, true);
  assertQaManagerRunState(state);
  assert.throws(
    () =>
      createQaManagerRunState({
        ...spec(),
        authorizationId: "approval-from-another-run",
      }),
    /deterministically bound to runId/,
  );
});

test("JSON schema validates initial, recovery, and terminal durable states", async () => {
  const schema = JSON.parse(
    await readFile(
      resolve(
        "docs/browser-acceptance/schemas/qa-manager-run-state.schema.json",
      ),
      "utf8",
    ),
  );
  const validate = new Ajv2020({ strict: true }).compile(schema);
  const initial = createQaManagerRunState(spec());
  let startPersisted = persistAndSend(observeChannel(executionState()));
  startPersisted = apply(startPersisted, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  startPersisted = apply(startPersisted, {
    type: "verify_browser_binding",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    bindingHash: HASH_D,
  });
  startPersisted = apply(startPersisted, {
    type: "start_browser_action",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  const recovery = reserveRecovery(terminalHostFailure(executionState()));
  const creating = apply(recovery, {
    type: "begin_continuation_create",
    actor: "manager",
    leaseKey: recovery.coordination.continuation.key,
  });
  const stopped = apply(creating, {
      type: "continuation_create_failed",
      actor: "manager",
      leaseKey: recovery.coordination.continuation.key,
      outcome: "ambiguous",
  });
  const terminal = apply(stopped, {
    type: "emit_terminal",
    actor: "manager",
  });
  for (const state of [initial, startPersisted, recovery, terminal]) {
    assert.equal(validate(state), true, JSON.stringify(validate.errors));
  }
});

test("worker handoff cannot create a continuation and manager persists its lease first", () => {
  let state = executionState();
  assert.equal(state.coordination.taskHistory[0].purpose, "bootstrap");
  assert.equal(state.coordination.continuation.purpose, "post_install_execution");
  assert.equal(state.coordination.continuation.state, "active");
  assert.throws(
    () =>
      apply(state, {
        type: "reserve_continuation",
        actor: "worker",
        purpose: "host_recovery",
      }),
    /recorded by manager/,
  );

  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(state.coordination.continuation.state, "reserved");
  assert.equal(
    state.coordination.continuation.key,
    "qa_recovery_fixture:host_recovery:1",
  );
  assert.equal(state.coordination.continuation.taskId, null);
  assert.equal(state.coordination.activeTask, null);
  assert.throws(
    () =>
      apply(state, {
        type: "activate_continuation",
        actor: "manager",
        leaseKey: state.coordination.continuation.key,
        taskId: "unsafe-direct-activation",
      }),
    /no creating continuation lease/,
  );
});

test("a persisted creating lease makes restart fail closed without a second create", () => {
  let state = reserveRecovery(terminalHostFailure(executionState()));
  const leaseKey = state.coordination.continuation.key;
  state = apply(state, {
    type: "begin_continuation_create",
    actor: "manager",
    leaseKey,
  });
  assert.equal(state.coordination.continuation.state, "creating");
  assert.throws(
    () =>
      apply(state, {
        type: "begin_continuation_create",
        actor: "manager",
        leaseKey,
      }),
    /no reserved continuation lease/,
  );
  state = apply(state, {
    type: "recover_manager_process",
    actor: "manager",
  });
  assert.equal(state.terminal.reason, "continuation_creation_ambiguous");
  assert.equal(state.coordination.continuation.state, "ambiguous");
  assert.equal(state.coordination.recoveryAttempts, 1);
});

test("failure before request delivery resumes at the next event", () => {
  let state = terminalHostFailure(executionState());
  state = reserveRecovery(state);
  assert.equal(state.coordination.continuation.resumeAt, "next_event");
});

test("failure after response persistence resumes by sending the exact stored response", () => {
  let state = observeChannel(executionState());
  state = apply(state, {
    type: "persist_response",
    actor: "manager",
    sequence: 1,
    responseHash: HASH_B,
  });
  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(
    state.coordination.continuation.resumeAt,
    "send_persisted_response",
  );
  assert.equal(state.protocol.pending.response.hash, HASH_B);
});

test("failure after send but before acceptance never synthesizes acceptance", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(
    state.coordination.continuation.resumeAt,
    "accept_persisted_response",
  );
  assert.equal(state.protocol.pending.action.state, "not_authorized");
});

test("failure after acceptance but before action start resumes without resending channel_begin", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  assert.equal(state.protocol.acceptedResponses.length, 1);
  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(state.coordination.continuation.resumeAt, "accepted_response");
  assert.equal(state.protocol.acceptedResponses.length, 1);
});

test("browser action cannot start until the selected binding is verified", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  assert.equal(state.protocol.pending.action.state, "authorized");
  assert.throws(
    () =>
      apply(state, {
        type: "start_browser_action",
        actor: "worker",
        channel: "instagram",
        browser: "chrome",
        action: QA_BROWSER_ACTION,
        actionHash: ACTION_HASH,
        timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
      }),
    /browser binding is not verified/,
  );
});

test("binding loss before action start remains retry-safe and never becomes ambiguous", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  assert.deepEqual(recoveryCheckpoint(state), {
    ok: true,
    resumeAt: "accepted_response",
  });
  state = apply(state, {
    type: "stop_run",
    actor: "manager",
    reason: "browser_binding_unavailable",
  });
  assert.equal(state.terminal.reason, "browser_binding_unavailable");
  assert.equal(state.terminal.checkpoint.action.state, "authorized");
  assert.notEqual(state.terminal.reason, "ambiguous_browser_action");
});

test("host recovery invalidates a verified binding before action start", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  state = apply(state, {
    type: "verify_browser_binding",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    bindingHash: HASH_D,
  });
  assert.equal(state.protocol.pending.action.state, "binding_verified");
  state = terminalHostFailure(state);
  assert.equal(state.protocol.pending.action.state, "authorized");
  assert.equal(state.protocol.pending.action.bindingHash, null);
  state = reserveRecovery(state);
  assert.equal(state.coordination.continuation.resumeAt, "accepted_response");
});

test("browser action start requires an exact hash and the fixed timeout", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  state = apply(state, {
    type: "verify_browser_binding",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    bindingHash: HASH_D,
  });
  assert.throws(
    () =>
      apply(state, {
        type: "start_browser_action",
        actor: "worker",
        channel: "instagram",
        browser: "chrome",
        action: QA_BROWSER_ACTION,
        timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
      }),
    /actionHash must be a SHA-256 hash/,
  );
  assert.throws(
    () =>
      apply(state, {
        type: "start_browser_action",
        actor: "worker",
        channel: "instagram",
        browser: "chrome",
        action: QA_BROWSER_ACTION,
        actionHash: HASH_C,
        timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
      }),
    /action hash does not match the canonical descriptor/,
  );
  assert.throws(
    () =>
      apply(state, {
        type: "start_browser_action",
        actor: "worker",
        channel: "instagram",
        browser: "chrome",
        action: QA_BROWSER_ACTION,
        actionHash: ACTION_HASH,
        timeoutMs: 30_000,
      }),
    /browser action timeout must be 60000 ms/,
  );
});

test("browser work remains gated until the manager acknowledges the persisted start", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  state = apply(state, {
    type: "verify_browser_binding",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    bindingHash: HASH_D,
  });
  state = apply(state, {
    type: "start_browser_action",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  assert.equal(state.protocol.pending.action.state, "start_persisted");
  assert.throws(
    () =>
      apply(state, {
        type: "complete_browser_action",
        actor: "worker",
        actionHash: ACTION_HASH,
        outcomeHash: HASH_D,
      }),
    /action was not started/,
  );
  assert.throws(
    () =>
      apply(state, {
        type: "authorize_browser_action_start",
        actor: "manager",
        channel: "instagram",
        browser: "chrome",
        action: QA_BROWSER_ACTION,
        actionHash: HASH_B,
        timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
      }),
    /action hash mismatch/,
  );
  state = apply(state, {
    type: "authorize_browser_action_start",
    actor: "manager",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  assert.equal(state.protocol.pending.action.state, "started");
});

test("host recovery before the start acknowledgement invalidates the binding and remains retry-safe", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  state = apply(state, {
    type: "verify_browser_binding",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    bindingHash: HASH_D,
  });
  state = apply(state, {
    type: "start_browser_action",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  assert.deepEqual(recoveryCheckpoint(state), {
    ok: true,
    resumeAt: "accepted_response",
  });
  state = terminalHostFailure(state);
  assert.equal(state.protocol.pending.action.state, "authorized");
  assert.equal(state.protocol.pending.action.bindingHash, null);
  assert.equal(state.protocol.pending.action.label, null);
  assert.equal(state.protocol.pending.action.hash, null);
  assert.equal(state.protocol.pending.action.timeoutMs, null);
  state = reserveRecovery(state);
  assert.equal(state.coordination.continuation.resumeAt, "accepted_response");
});

test("failure after action start is terminal and cannot create a recovery continuation", () => {
  let state = acceptAndStart(
    persistAndSend(observeChannel(executionState())),
  );
  assert.deepEqual(recoveryCheckpoint(state), {
    ok: false,
    reason: "ambiguous_browser_action",
  });
  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(state.terminal.reason, "ambiguous_browser_action");
  assert.equal(state.coordination.recoveryAttempts, 0);
  assert.equal(state.authorization.consumed, true);
  assert.equal(state.protocol.pending, null);
  assert.equal(state.terminal.checkpoint.action.state, "started");
});

test("failure after durable action completion resumes at result persistence", () => {
  let state = acceptAndStart(
    persistAndSend(observeChannel(executionState())),
  );
  state = apply(state, {
    type: "release_target",
    actor: "worker",
    leaseHash: state.protocol.pending.action.target.leaseHash,
  });
  state = apply(state, {
    type: "complete_browser_action",
    actor: "worker",
    actionHash: ACTION_HASH,
    outcomeHash: HASH_D,
  });
  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(
    state.coordination.continuation.resumeAt,
    "persist_channel_result",
  );
});

test("dedicated target creation is acknowledged, typed, task-scoped, and released before completion", () => {
  let state = persistAndSend(observeChannel(executionState()));
  state = apply(state, {
    type: "accept_response",
    actor: "worker",
    responseHash: HASH_B,
  });
  state = apply(state, {
    type: "verify_browser_binding",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    bindingHash: HASH_D,
  });
  state = apply(state, {
    type: "start_browser_action",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  const leaseHash = dedicatedTargetLeaseHash({
    runId: state.run.runId,
    taskId: state.coordination.activeTask.taskId,
    channel: "instagram",
    browser: "chrome",
    actionHash: ACTION_HASH,
  });
  assert.throws(
    () => apply(state, {
      type: "record_target_created",
      actor: "worker",
      channel: "instagram",
      browser: "chrome",
      officialRoot: "https://www.instagram.com/",
      leaseHash,
    }),
    /action was not started/,
  );
  state = apply(state, {
    type: "authorize_browser_action_start",
    actor: "manager",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  assert.throws(
    () => apply(state, {
      type: "record_target_created",
      actor: "worker",
      channel: "instagram",
      browser: "chrome",
      officialRoot: "https://example.invalid/",
      leaseHash,
    }),
    /typed official root/,
  );
  state = apply(state, {
    type: "record_target_created",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    officialRoot: "https://www.instagram.com/",
    leaseHash,
  });
  assert.equal(state.protocol.pending.action.target.state, "created");
  assert.throws(
    () => apply(state, {
      type: "complete_browser_action",
      actor: "worker",
      actionHash: ACTION_HASH,
      outcomeHash: HASH_D,
    }),
    /must be released/,
  );
  state = apply(state, {
    type: "release_target",
    actor: "worker",
    leaseHash,
  });
  assert.equal(state.protocol.pending.action.target.state, "released");
});

test("manual authentication retains the lease only in-task and recreates it after a task boundary", () => {
  let state = acceptAndStart(persistAndSend(observeChannel(executionState())));
  const firstLease = state.protocol.pending.action.target.leaseHash;
  state = apply(state, {
    type: "mark_authentication_handoff",
    actor: "worker",
    leaseHash: firstLease,
  });
  assert.deepEqual(recoveryCheckpoint(state), {
    ok: false,
    reason: "ambiguous_browser_action",
  });
  state = terminalHostFailure(state);
  assert.equal(state.protocol.pending.action.target.state, "recreation_required");
  assert.equal(state.protocol.pending.action.target.leaseHash, null);
  assert.deepEqual(recoveryCheckpoint(state), {
    ok: true,
    resumeAt: "recreate_target_from_official_root",
  });
  state = reserveRecovery(state);
  const continuationKey = state.coordination.continuation.key;
  state = apply(state, {
    type: "begin_continuation_create",
    actor: "manager",
    leaseKey: continuationKey,
  });
  state = apply(state, {
    type: "activate_continuation",
    actor: "manager",
    leaseKey: continuationKey,
    taskId: "auth-recovery-1",
  });
  const secondLease = dedicatedTargetLeaseHash({
    runId: state.run.runId,
    taskId: "auth-recovery-1",
    channel: "instagram",
    browser: "chrome",
    actionHash: ACTION_HASH,
  });
  assert.notEqual(secondLease, firstLease);
  state = apply(state, {
    type: "recreate_target_after_authentication",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    officialRoot: "https://www.instagram.com/",
    leaseHash: secondLease,
  });
  assert.equal(state.protocol.pending.action.target.state, "created");
  assert.equal(state.protocol.pending.action.target.leaseHash, secondLease);
});

test("failure after result persistence re-emits evidence without repeating the action", () => {
  let state = completeAndPersistResult(
    acceptAndStart(persistAndSend(observeChannel(executionState()))),
  );
  assert.deepEqual(state.protocol.completedChannels, ["instagram"]);
  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(
    state.coordination.continuation.resumeAt,
    "emit_persisted_result",
  );
  assert.equal(state.protocol.pending.action.state, "completed");
  assert.equal(state.protocol.pending.result.state, "persisted");
});

test("durably emitted channel result advances to the next selected channel only", () => {
  let state = completeAndPersistResult(
    acceptAndStart(persistAndSend(observeChannel(executionState()))),
  );
  state = apply(state, {
    type: "emit_persisted_result",
    actor: "worker",
    resultHash: HASH_D,
  });
  assert.deepEqual(state.protocol.completedChannels, ["instagram"]);
  assert.throws(
    () => observeChannel(state, "instagram"),
    /channel is out of order/,
  );
  state = terminalHostFailure(state);
  state = reserveRecovery(state);
  assert.equal(state.coordination.continuation.resumeAt, "next_event");
});

test("ambiguous continuation creation stops once and is never retried", () => {
  let state = reserveRecovery(terminalHostFailure(executionState()));
  const leaseKey = state.coordination.continuation.key;
  state = apply(state, {
    type: "begin_continuation_create",
    actor: "manager",
    leaseKey,
  });
  state = apply(state, {
    type: "continuation_create_failed",
    actor: "manager",
    leaseKey,
    outcome: "ambiguous",
  });
  assert.equal(state.terminal.reason, "continuation_creation_ambiguous");
  assert.equal(state.coordination.continuation.state, "ambiguous");
  assert.equal(state.coordination.recoveryAttempts, 1);
  assert.throws(
    () => reserveRecovery(state),
    /run is already terminal/,
  );
});

test("a second host failure exhausts the single recovery attempt with one truthful stop", () => {
  let state = reserveRecovery(terminalHostFailure(executionState()));
  const leaseKey = state.coordination.continuation.key;
  state = apply(state, {
    type: "begin_continuation_create",
    actor: "manager",
    leaseKey,
  });
  state = apply(state, {
    type: "activate_continuation",
    actor: "manager",
    leaseKey,
    taskId: "recovery-1",
  });
  state = terminalHostFailure(state, "recovery-1");
  state = reserveRecovery(state);
  assert.deepEqual(state.terminal, {
    resultId: "run_stopped",
    reason: "worker_host_unavailable",
    disposition: "blocked",
    blockingProductFinding: false,
    resumeSupported: false,
    emitted: false,
    checkpoint: null,
  });
  state = apply(state, { type: "emit_terminal", actor: "manager" });
  const emitted = apply(state, { type: "emit_terminal", actor: "manager" });
  assert.deepEqual(emitted, state);
  assert.equal(emitted.terminal.emitted, true);
  assert.equal(emitted.authorization.browserAccessAuthorized, false);
  assert.equal(emitted.authorization.consumed, true);
});

test("run_complete requires the last result emission and closes active work", () => {
  let state = completeAndPersistResult(
    acceptAndStart(
      persistAndSend(
        observeChannel(
          executionState({ ...spec(), channels: ["instagram"] }),
        ),
      ),
    ),
  );
  assert.throws(
    () => apply(state, { type: "run_complete", actor: "manager" }),
    /pending protocol work/,
  );
  state = apply(state, {
    type: "emit_persisted_result",
    actor: "worker",
    resultHash: HASH_D,
  });
  state = apply(state, {
    type: "run_complete",
    actor: "manager",
    disposition: "pass",
  });
  assert.equal(state.coordination.activeTask, null);
  assert.equal(state.protocol.pending, null);
  assert.equal(state.terminal.resultId, "run_complete");
  assert.equal(state.terminal.checkpoint, null);
  assert.equal(state.authorization.consumed, true);
});

test("CLI create, apply, and check atomically maintain ignored-state-compatible JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-recovery-"));
  const specPath = join(directory, "spec.json");
  const statePath = join(directory, "state.json");
  const eventPath = join(directory, "event.json");
  await writeFile(specPath, JSON.stringify(spec()), "utf8");

  const created = await runQaRecoveryCli([
    "create",
    "--state",
    statePath,
    "--spec",
    specPath,
  ]);
  assert.equal(created.ok, true);
  await writeFile(
    eventPath,
    JSON.stringify({
      type: "activate_initial_task",
      actor: "manager",
      taskId: "bootstrap-cli",
    }),
    "utf8",
  );
  const applied = await runQaRecoveryCli([
    "apply",
    "--state",
    statePath,
    "--event",
    eventPath,
  ]);
  assert.equal(applied.ok, true);
  const checked = await runQaRecoveryCli(["check", "--state", statePath]);
  assert.equal(checked.ok, true);
  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(state.coordination.activeTask.taskId, "bootstrap-cli");
  await assert.rejects(
    runQaRecoveryCli([
      "create",
      "--state",
      statePath,
      "--spec",
      specPath,
    ]),
    /EEXIST/,
  );
});
