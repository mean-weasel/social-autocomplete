import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import {
  applyQaRecoveryEvent,
  assertAuthenticationRecoveryLease,
  assertQaCheckpointAck,
  assertQaManagerRunState,
  browserActionDescriptorHash,
  createQaManagerRunState,
  dedicatedTargetLeaseHash,
  issueAuthenticationRecoveryLease,
  issueQaCheckpointAck,
  qaIssuanceClaimPath,
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
const execFileAsync = promisify(execFile);
const recoveryCliPath = resolve("scripts/browser-acceptance/qa-recovery.mjs");
const recoveryCliUrl = pathToFileURL(recoveryCliPath).href;

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
  const issuance = issueQaCheckpointAck(state);
  state = issuance.state;
  const acknowledgement = issuance.acknowledgement;
  assertQaCheckpointAck({
    protocol: "qa-manager-worker/v1",
    runId: state.run.runId,
    sequence: state.protocol.pending.sequence,
    channel: state.protocol.pending.channel,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
    targetLeaseHash: acknowledgement.targetLeaseHash,
  }, acknowledgement);
  return apply(state, {
    type: "record_target_created",
    actor: "worker",
    channel: state.protocol.pending.channel,
    browser: state.run.browser,
    officialRoot: "https://www.instagram.com/",
    leaseHash: acknowledgement.targetLeaseHash,
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

function initialAckReadyState() {
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
  return apply(state, {
    type: "authorize_browser_action_start",
    actor: "manager",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
}

function authenticationRecoveryReadyState() {
  let state = acceptAndStart(persistAndSend(observeChannel(executionState())));
  state = apply(state, {
    type: "mark_authentication_handoff",
    actor: "worker",
    leaseHash: state.protocol.pending.action.target.leaseHash,
  });
  state = reserveRecovery(terminalHostFailure(state));
  const leaseKey = state.coordination.continuation.key;
  state = apply(state, {
    type: "begin_continuation_create",
    actor: "manager",
    leaseKey,
  });
  return apply(state, {
    type: "activate_continuation",
    actor: "manager",
    leaseKey,
    taskId: "auth-recovery-cli",
  });
}

async function runRecoveryCliProcess(...args) {
  return execFileAsync(process.execPath, [recoveryCliPath, ...args], {
    encoding: "utf8",
  });
}

async function assertCliRejectsWithoutStdout(...args) {
  await assert.rejects(
    runRecoveryCliProcess(...args),
    (error) => {
      assert.equal(error.stdout, "");
      return true;
    },
  );
}

async function runContentionRound(command, readyState) {
  const directory = await mkdtemp(join(tmpdir(), `qa-${command}-race-`));
  const statePath = join(directory, "state.json");
  await writeFile(statePath, JSON.stringify(readyState), "utf8");
  const attempts = await Promise.allSettled(
    Array.from({ length: 16 }, () =>
      runRecoveryCliProcess(command, "--state", statePath),
    ),
  );
  const winners = attempts.filter((attempt) => attempt.status === "fulfilled");
  const losers = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 15);
  assert.equal(winners[0].value.stderr, "");
  assert.doesNotThrow(() => JSON.parse(winners[0].value.stdout));
  for (const loser of losers) {
    assert.equal(loser.reason.stdout, "");
  }
  return JSON.parse(await readFile(statePath, "utf8"));
}

async function runCrossCommandContentionRound(command, readyState, event) {
  const directory = await mkdtemp(join(tmpdir(), `qa-${command}-apply-race-`));
  const statePath = join(directory, "state.json");
  const eventPath = join(directory, "event.json");
  await Promise.all([
    writeFile(statePath, JSON.stringify(readyState), "utf8"),
    writeFile(eventPath, JSON.stringify(event), "utf8"),
  ]);
  const [issuance, mutation] = await Promise.allSettled([
    runRecoveryCliProcess(command, "--state", statePath),
    runRecoveryCliProcess(
      "apply",
      "--state",
      statePath,
      "--event",
      eventPath,
    ),
  ]);
  assert.equal(mutation.status, "fulfilled");
  assert.equal(mutation.value.stderr, "");
  assert.equal(JSON.parse(mutation.value.stdout).ok, true);
  if (issuance.status === "fulfilled") {
    assert.equal(issuance.value.stderr, "");
    const envelope = JSON.parse(issuance.value.stdout);
    assert.equal("taskId" in envelope, false);
    assert.equal("targetHandle" in envelope, false);
    assert.equal("privateState" in envelope, false);
  } else {
    assert.equal(issuance.reason.stdout, "");
  }
  return {
    issuanceSucceeded: issuance.status === "fulfilled",
    state: JSON.parse(await readFile(statePath, "utf8")),
  };
}

async function leaveCrashedIssuanceClaim(statePath, command) {
  const script = `
    import { acquireQaIssuanceClaim } from ${JSON.stringify(recoveryCliUrl)};
    await acquireQaIssuanceClaim(process.argv[1], process.argv[2]);
    process.exit(86);
  `;
  await assert.rejects(
    execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", script, statePath, command],
      { encoding: "utf8" },
    ),
    (error) => {
      assert.equal(error.code, 86);
      assert.equal(error.stdout, "");
      return true;
    },
  );
}

function terminalRunState() {
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
    taskId: "recovery-terminal-cli",
  });
  state = terminalHostFailure(state, "recovery-terminal-cli");
  return reserveRecovery(state);
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
    () => assertQaManagerRunState({ ...state, privateBrowserOutput: { rawTargetId: "private" } }),
    /fields mismatch/,
  );
  assert.throws(
    () => assertQaManagerRunState({ ...state, run: { ...state.run, rawTargetId: "private" } }),
    /fields mismatch/,
  );
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
  const issuance = issueQaCheckpointAck(state);
  state = issuance.state;
  const acknowledgement = issuance.acknowledgement;
  assert.equal(
    acknowledgement.targetLeaseHash,
    state.protocol.pending.action.target.leaseHash,
  );
});

test("worker rejects a missing or substituted manager lease before browser invocation", () => {
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
  state = apply(state, {
    type: "authorize_browser_action_start",
    actor: "manager",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  const issuance = issueQaCheckpointAck(state);
  state = issuance.state;
  const acknowledgement = issuance.acknowledgement;
  let browserInvocations = 0;
  const invokeBrowser = (copiedTargetLeaseHash) => {
    assertQaCheckpointAck({
      protocol: "qa-manager-worker/v1",
      runId: state.run.runId,
      sequence: state.protocol.pending.sequence,
      channel: "instagram",
      actionHash: ACTION_HASH,
      timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
      targetLeaseHash: copiedTargetLeaseHash,
    }, acknowledgement);
    browserInvocations += 1;
  };

  assert.throws(() => invokeBrowser(undefined), /targetLeaseHash mismatch/);
  assert.throws(() => invokeBrowser(HASH_C), /targetLeaseHash mismatch/);
  assert.equal(browserInvocations, 0);
  invokeBrowser(acknowledgement.targetLeaseHash);
  assert.equal(browserInvocations, 1);
});

test("initial acknowledgement issuance is durable, single-use, and unavailable after task termination or manager recovery", () => {
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
  state = apply(state, {
    type: "authorize_browser_action_start",
    actor: "manager",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });

  const issuance = issueQaCheckpointAck(state);
  state = issuance.state;
  assert.equal(state.protocol.pending.action.acknowledgementState, "issued");
  assert.throws(
    () => issueQaCheckpointAck(state),
    /not available for issuance/,
  );
  const recoveredManagerState = apply(state, {
    type: "recover_manager_process",
    actor: "manager",
  });
  assert.throws(
    () => issueQaCheckpointAck(recoveredManagerState),
    /not available for issuance/,
  );
  const terminalTaskState = apply(state, {
    type: "task_terminal",
    actor: "manager",
    reason: "worker_stopped",
  });
  assert.throws(
    () => issueQaCheckpointAck(terminalTaskState),
    /no active worker task/,
  );
});

test("worker rejects every missing, mismatched, or extra acknowledgement field", () => {
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
  state = apply(state, {
    type: "authorize_browser_action_start",
    actor: "manager",
    channel: "instagram",
    browser: "chrome",
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
  });
  const issuance = issueQaCheckpointAck(state);
  const acknowledgement = issuance.acknowledgement;
  const intent = {
    protocol: "qa-manager-worker/v1",
    runId: state.run.runId,
    sequence: state.protocol.pending.sequence,
    channel: "instagram",
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
    targetLeaseHash: acknowledgement.targetLeaseHash,
  };

  for (const field of Object.keys(acknowledgement)) {
    const missing = { ...acknowledgement };
    delete missing[field];
    assert.throws(
      () => assertQaCheckpointAck(intent, missing),
      /QA_CHECKPOINT_ACK fields mismatch/,
      `missing ${field}`,
    );
  }
  const mismatches = {
    protocol: "qa-manager-worker/v0",
    runId: "qa_other",
    sequence: acknowledgement.sequence + 1,
    checkpointId: "wrong_checkpoint",
    channel: "facebook",
    actionHash: HASH_C,
    timeoutMs: acknowledgement.timeoutMs + 1,
    targetLeaseHash: HASH_C,
  };
  for (const [field, value] of Object.entries(mismatches)) {
    assert.throws(
      () =>
        assertQaCheckpointAck(intent, {
          ...acknowledgement,
          [field]: value,
        }),
      new RegExp(`${field} mismatch`),
      `mismatched ${field}`,
    );
  }
  assert.throws(
    () =>
      assertQaCheckpointAck(intent, {
        ...acknowledgement,
        taskId: "private-task",
      }),
    /QA_CHECKPOINT_ACK fields mismatch/,
  );
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

test("one post-ACK finalization atomically records a released target and completed action", () => {
  const issuance = issueQaCheckpointAck(initialAckReadyState());
  const leaseHash = issuance.acknowledgement.targetLeaseHash;
  const state = apply(issuance.state, {
    type: "finalize_browser_action",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    officialRoot: "https://www.instagram.com/",
    targetOwnership: "plugin_owned",
    targetLifecycle: "released",
    leaseHash,
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
    outcomeHash: HASH_D,
  });
  assert.equal(state.protocol.pending.action.target.state, "released");
  assert.equal(state.protocol.pending.action.state, "completed");
  assert.equal(state.protocol.pending.action.outcomeHash, HASH_D);
  assert.deepEqual(recoveryCheckpoint(state), {
    ok: true,
    resumeAt: "persist_channel_result",
  });
});

test("atomic finalization rejects unacknowledged, substituted, or unreleased target evidence", () => {
  const unissued = initialAckReadyState();
  const issuance = issueQaCheckpointAck(unissued);
  const leaseHash = issuance.acknowledgement.targetLeaseHash;
  const valid = {
    type: "finalize_browser_action",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    officialRoot: "https://www.instagram.com/",
    targetOwnership: "plugin_owned",
    targetLifecycle: "released",
    leaseHash,
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
    outcomeHash: HASH_D,
  };
  assert.throws(() => apply(unissued, valid), /acknowledgement was not durably issued/);
  for (const [change, pattern] of [
    [{ actor: "manager" }, /must be recorded by worker/],
    [{ channel: "facebook" }, /channel mismatch/],
    [{ browser: "in_app" }, /browser mismatch/],
    [{ leaseHash: HASH_A }, /lease mismatch/],
    [{ officialRoot: "https://example.invalid/" }, /typed official root/],
    [{ targetOwnership: "user_owned" }, /ownership mismatch/],
    [{ targetLifecycle: "created" }, /requires a released target/],
    [{ action: "unbounded_research" }, /action label mismatch/],
    [{ actionHash: HASH_A }, /action hash mismatch/],
    [{ timeoutMs: 1 }, /timeout must be 60000 ms/],
    [{ outcomeHash: "invalid" }, /outcomeHash must be a SHA-256 hash/],
  ]) {
    assert.throws(() => apply(issuance.state, { ...valid, ...change }), pattern);
  }
});

test("atomic finalization requires every sanitized field and rejects raw target transport", () => {
  const issuance = issueQaCheckpointAck(initialAckReadyState());
  const valid = {
    type: "finalize_browser_action",
    actor: "worker",
    channel: "instagram",
    browser: "chrome",
    officialRoot: "https://www.instagram.com/",
    targetOwnership: "plugin_owned",
    targetLifecycle: "released",
    leaseHash: issuance.acknowledgement.targetLeaseHash,
    action: QA_BROWSER_ACTION,
    actionHash: ACTION_HASH,
    timeoutMs: QA_BROWSER_ACTION_TIMEOUT_MS,
    outcomeHash: HASH_D,
  };
  for (const field of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[field];
    assert.throws(
      () => apply(issuance.state, missing),
      /finalize_browser_action fields mismatch|event type is required/,
      `missing ${field} must fail closed`,
    );
  }
  for (const extra of [
    { targetId: "raw-target-id" },
    { targetHandle: "raw-target-handle" },
    { binding: { raw: true } },
  ]) {
    assert.throws(
      () => apply(issuance.state, { ...valid, ...extra }),
      /finalize_browser_action fields mismatch/,
    );
  }
  assert.equal(issuance.state.protocol.pending.action.target.state, "not_created");
  assert.equal(issuance.state.protocol.pending.action.state, "started");
  assert.equal(issuance.state.protocol.pending.action.outcomeHash, null);
});

test("failure before atomic finalization remains non-replayable terminal ambiguity", () => {
  const issuance = issueQaCheckpointAck(initialAckReadyState());
  assert.deepEqual(recoveryCheckpoint(issuance.state), {
    ok: false,
    reason: "ambiguous_browser_action",
  });
  const terminal = reserveRecovery(terminalHostFailure(issuance.state));
  assert.equal(terminal.terminal.reason, "ambiguous_browser_action");
  assert.equal(terminal.terminal.checkpoint.action.state, "started");
  assert.equal(terminal.terminal.checkpoint.action.target.state, "not_created");
  assert.equal(terminal.authorization.consumed, true);
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
  const issuance = issueQaCheckpointAck(state);
  state = issuance.state;
  assert.equal(state.protocol.pending.action.target.leaseHash, leaseHash);
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
  const recoveryIssuance = issueAuthenticationRecoveryLease(state);
  state = recoveryIssuance.state;
  const delivery = recoveryIssuance.delivery;
  assert.deepEqual(Object.keys(delivery), [
    "protocol",
    "runId",
    "sequence",
    "checkpointId",
    "channel",
    "targetLeaseHash",
  ]);
  assert.equal("taskId" in delivery, false);
  assert.equal("targetHandle" in delivery, false);
  assert.equal("privateState" in delivery, false);
  const secondLease = delivery.targetLeaseHash;
  assert.notEqual(secondLease, firstLease);
  assertAuthenticationRecoveryLease({
    protocol: "qa-manager-worker/v1",
    runId: state.run.runId,
    sequence: state.protocol.pending.sequence,
    channel: "instagram",
    targetLeaseHash: secondLease,
  }, delivery);
  assert.throws(
    () => issueAuthenticationRecoveryLease(state),
    /not available for issuance/,
  );
  assert.throws(
    () =>
      assertAuthenticationRecoveryLease({
        protocol: "qa-manager-worker/v1",
        runId: state.run.runId,
        sequence: state.protocol.pending.sequence,
        channel: "instagram",
        targetLeaseHash: HASH_C,
      }, delivery),
    /targetLeaseHash mismatch/,
  );
  assert.throws(
    () =>
      assertAuthenticationRecoveryLease({
        protocol: "qa-manager-worker/v1",
        runId: state.run.runId,
        sequence: state.protocol.pending.sequence,
        channel: "instagram",
        targetLeaseHash: secondLease,
      }, { ...delivery, taskId: "private-task" }),
    /fields mismatch/,
  );
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

test("a complete failing run preserves the product finding and consumes authorization", () => {
  let state = completeAndPersistResult(
    acceptAndStart(
      persistAndSend(
        observeChannel(
          executionState({ ...spec(), channels: ["instagram"] }),
        ),
      ),
    ),
  );
  state = apply(state, {
    type: "emit_persisted_result",
    actor: "worker",
    resultHash: HASH_D,
  });
  state = apply(state, {
    type: "run_complete",
    actor: "manager",
    disposition: "fail",
    blockingProductFinding: true,
  });
  assert.equal(state.terminal.disposition, "fail");
  assert.equal(state.terminal.blockingProductFinding, true);
  assert.equal(state.authorization.browserAccessAuthorized, false);
  assert.equal(state.authorization.consumed, true);
  assert.throws(
    () => apply(state, {
      type: "run_complete",
      actor: "manager",
      disposition: "fail",
      blockingProductFinding: true,
    }),
    /run is already terminal/,
  );
});

test("blockingProductFinding is rejected on passing complete runs", () => {
  let state = completeAndPersistResult(
    acceptAndStart(
      persistAndSend(
        observeChannel(
          executionState({ ...spec(), channels: ["instagram"] }),
        ),
      ),
    ),
  );
  state = apply(state, {
    type: "emit_persisted_result",
    actor: "worker",
    resultHash: HASH_D,
  });
  assert.throws(
    () => apply(state, {
      type: "run_complete",
      actor: "manager",
      disposition: "pass",
      blockingProductFinding: true,
    }),
    /blockingProductFinding must be true only/,
  );
});

test("CLI issue-ack persists issued state before emitting only the sanitized envelope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-recovery-ack-"));
  const statePath = join(directory, "state.json");
  await writeFile(statePath, JSON.stringify(initialAckReadyState()), "utf8");

  const issued = await runRecoveryCliProcess(
    "issue-ack",
    "--state",
    statePath,
  );
  const acknowledgement = JSON.parse(issued.stdout);
  assert.deepEqual(Object.keys(acknowledgement), [
    "protocol",
    "runId",
    "sequence",
    "checkpointId",
    "channel",
    "actionHash",
    "timeoutMs",
    "targetLeaseHash",
  ]);
  assert.equal("ok" in acknowledgement, false);
  assert.equal("taskId" in acknowledgement, false);
  assert.equal("targetHandle" in acknowledgement, false);
  assert.equal("privateState" in acknowledgement, false);
  const issuedState = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(
    issuedState.protocol.pending.action.acknowledgementState,
    "issued",
  );
  assert.equal(
    issuedState.protocol.pending.action.target.leaseHash,
    acknowledgement.targetLeaseHash,
  );

  await assertCliRejectsWithoutStdout(
    "issue-ack",
    "--state",
    statePath,
  );
  const recoveredState = apply(issuedState, {
    type: "recover_manager_process",
    actor: "manager",
  });
  await writeFile(statePath, JSON.stringify(recoveredState), "utf8");
  await assertCliRejectsWithoutStdout(
    "issue-ack",
    "--state",
    statePath,
  );

  const terminalTaskState = apply(initialAckReadyState(), {
    type: "task_terminal",
    actor: "manager",
    reason: "worker_stopped",
  });
  await writeFile(statePath, JSON.stringify(terminalTaskState), "utf8");
  await assertCliRejectsWithoutStdout(
    "issue-ack",
    "--state",
    statePath,
  );

  await writeFile(statePath, JSON.stringify(terminalRunState()), "utf8");
  await assertCliRejectsWithoutStdout(
    "issue-ack",
    "--state",
    statePath,
  );
});

test("CLI issue-auth-recovery persists issued state and never re-emits from saved terminal or recovered state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-recovery-auth-"));
  const statePath = join(directory, "state.json");
  await writeFile(
    statePath,
    JSON.stringify(authenticationRecoveryReadyState()),
    "utf8",
  );

  const issued = await runRecoveryCliProcess(
    "issue-auth-recovery",
    "--state",
    statePath,
  );
  const delivery = JSON.parse(issued.stdout);
  assert.deepEqual(Object.keys(delivery), [
    "protocol",
    "runId",
    "sequence",
    "checkpointId",
    "channel",
    "targetLeaseHash",
  ]);
  assert.equal("ok" in delivery, false);
  assert.equal("taskId" in delivery, false);
  assert.equal("targetHandle" in delivery, false);
  assert.equal("privateState" in delivery, false);
  const issuedState = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(
    issuedState.protocol.pending.action.target.recoveryLeaseDeliveryState,
    "issued",
  );
  assert.equal(
    issuedState.protocol.pending.action.target.leaseHash,
    delivery.targetLeaseHash,
  );

  await assertCliRejectsWithoutStdout(
    "issue-auth-recovery",
    "--state",
    statePath,
  );
  const recoveredState = apply(issuedState, {
    type: "recover_manager_process",
    actor: "manager",
  });
  await writeFile(statePath, JSON.stringify(recoveredState), "utf8");
  await assertCliRejectsWithoutStdout(
    "issue-auth-recovery",
    "--state",
    statePath,
  );

  const terminalTaskState = apply(authenticationRecoveryReadyState(), {
    type: "task_terminal",
    actor: "manager",
    reason: "worker_stopped",
  });
  await writeFile(statePath, JSON.stringify(terminalTaskState), "utf8");
  await assertCliRejectsWithoutStdout(
    "issue-auth-recovery",
    "--state",
    statePath,
  );

  await writeFile(statePath, JSON.stringify(terminalRunState()), "utf8");
  await assertCliRejectsWithoutStdout(
    "issue-auth-recovery",
    "--state",
    statePath,
  );
});

test("issue-ack is a single winner across repeated 16-process contention", async () => {
  for (let round = 0; round < 3; round += 1) {
    const state = await runContentionRound(
      "issue-ack",
      initialAckReadyState(),
    );
    assert.equal(
      state.protocol.pending.action.acknowledgementState,
      "issued",
    );
  }
});

test("issue-auth-recovery is a single winner across repeated 16-process contention", async () => {
  for (let round = 0; round < 3; round += 1) {
    const state = await runContentionRound(
      "issue-auth-recovery",
      authenticationRecoveryReadyState(),
    );
    assert.equal(
      state.protocol.pending.action.target.recoveryLeaseDeliveryState,
      "issued",
    );
  }
});

test("issue-ack is linearizable with stop_run and cannot restore terminal authorization", async () => {
  for (let round = 0; round < 3; round += 1) {
    const { state } = await runCrossCommandContentionRound(
      "issue-ack",
      initialAckReadyState(),
      {
        type: "stop_run",
        actor: "manager",
        reason: "browser_binding_unavailable",
      },
    );
    assert.equal(state.terminal.resultId, "run_stopped");
    assert.equal(state.terminal.reason, "browser_binding_unavailable");
    assert.equal(state.authorization.browserAccessAuthorized, false);
    assert.equal(state.authorization.consumed, true);
    assert.equal(state.protocol.pending, null);
  }
});

test("issue-ack is linearizable with task_terminal without resurrecting the task", async () => {
  for (let round = 0; round < 3; round += 1) {
    const { issuanceSucceeded, state } =
      await runCrossCommandContentionRound(
        "issue-ack",
        initialAckReadyState(),
        {
          type: "task_terminal",
          actor: "manager",
          reason: "system_error",
        },
      );
    assert.equal(state.coordination.activeTask, null);
    assert.equal(state.coordination.taskHistory.at(-1).status, "terminal");
    assert.equal(
      state.protocol.pending.action.acknowledgementState,
      issuanceSucceeded ? "issued" : "pending",
    );
  }
});

test("issue-auth-recovery is linearizable with stop_run and recovery task termination", async () => {
  for (const event of [
    {
      type: "stop_run",
      actor: "manager",
      reason: "worker_host_unavailable",
    },
    {
      type: "task_terminal",
      actor: "manager",
      reason: "system_error",
    },
  ]) {
    for (let round = 0; round < 3; round += 1) {
      const { issuanceSucceeded, state } =
        await runCrossCommandContentionRound(
          "issue-auth-recovery",
          authenticationRecoveryReadyState(),
          event,
        );
      assert.equal(state.coordination.activeTask, null);
      if (event.type === "stop_run") {
        assert.equal(state.terminal.resultId, "run_stopped");
        assert.equal(state.authorization.browserAccessAuthorized, false);
        assert.equal(state.authorization.consumed, true);
        assert.equal(state.protocol.pending, null);
      } else {
        assert.equal(
          state.protocol.pending.action.target.recoveryLeaseDeliveryState,
          issuanceSucceeded ? "issued" : "pending",
        );
        assert.equal(
          state.coordination.taskHistory.at(-1).status,
          "terminal",
        );
      }
    }
  }
});

test("crashed or stale issuance claims fail closed without replay or private metadata", async () => {
  for (const [command, readyState, pendingState] of [
    [
      "issue-ack",
      initialAckReadyState(),
      (state) => state.protocol.pending.action.acknowledgementState,
    ],
    [
      "issue-auth-recovery",
      authenticationRecoveryReadyState(),
      (state) =>
        state.protocol.pending.action.target.recoveryLeaseDeliveryState,
    ],
  ]) {
    const directory = await mkdtemp(join(tmpdir(), `qa-${command}-crash-`));
    const statePath = join(directory, "state.json");
    await writeFile(statePath, JSON.stringify(readyState), "utf8");
    await leaveCrashedIssuanceClaim(statePath, command);

    const claimPath = qaIssuanceClaimPath(statePath, command);
    const claim = JSON.parse(await readFile(claimPath, "utf8"));
    assert.deepEqual(Object.keys(claim), ["schemaVersion", "nonce"]);
    assert.equal(claim.schemaVersion, "qa-issuance-claim/v1");
    assert.match(claim.nonce, /^[a-f0-9-]{36}$/);
    const serializedClaim = JSON.stringify(claim);
    for (const privateValue of [
      readyState.run.runId,
      readyState.coordination.activeTask.taskId,
      readyState.protocol.pending.action.target.leaseHash,
      "targetHandle",
      "privateState",
    ]) {
      assert.equal(serializedClaim.includes(privateValue), false);
    }

    await assertCliRejectsWithoutStdout(command, "--state", statePath);
    await assertCliRejectsWithoutStdout(command, "--state", statePath);
    const eventPath = join(directory, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify({
        type: "stop_run",
        actor: "manager",
        reason: "worker_host_unavailable",
      }),
      "utf8",
    );
    await assertCliRejectsWithoutStdout(
      "apply",
      "--state",
      statePath,
      "--event",
      eventPath,
    );
    const unchangedState = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(pendingState(unchangedState), "pending");
    assert.equal(
      await readFile(claimPath, "utf8"),
      `${serializedClaim}\n`,
    );
  }
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
