import { spawn as nodeSpawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const wrapper = new URL("./owned-process-epoch-wrapper.mjs", import.meta.url);
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export function composePrimaryAndClosureFailure(primaryError, closureError) {
  return new AggregateError([primaryError, closureError], `${primaryError.message}; ${closureError.message}`);
}

export async function acquireTempRoot({ prefix, borrowedRoot, descendant }) {
  if (borrowedRoot) {
    if (!descendant || descendant.includes("/") || descendant.includes("\\")) throw new Error("Borrowed temporary roots require one safe descendant name");
    const path = join(borrowedRoot, descendant);
    await mkdir(path, { recursive: true });
    return { path, owned: false, state: "borrowed" };
  }
  return { path: await mkdtemp(join(tmpdir(), prefix)), owned: true, state: "active" };
}

async function removeExactRoot(root, closureToken, borrowed) {
  if (!closureToken?.verified) throw new Error(`closure_unverified: refusing to remove ${borrowed ? "borrowed temporary descendant" : "owned temporary root"}`);
  if (root.state !== (borrowed ? "borrowed" : "active")) throw new Error("Temporary root was already released");
  await rm(root.path, { recursive: true, force: true });
  try { await access(root.path); } catch (error) {
    if (error?.code === "ENOENT") { root.state = "released"; return; }
    throw error;
  }
  throw new Error(`Temporary root still exists after cleanup: ${root.path}`);
}

export async function removeOwnedTempRoot(root, closureToken) {
  if (!root?.owned) return;
  await removeExactRoot(root, closureToken, false);
}

export async function removeAcquiredTempRoot(root, closureToken) {
  if (!root?.owned) return removeExactRoot(root, closureToken, true);
  return removeOwnedTempRoot(root, closureToken);
}

function waitFor(promise, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), timeout);
    promise.then((value) => { clearTimeout(timer); resolve({ timedOut: false, value }); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

// The parent only exchanges nonce-bound protocol frames with the detached
// anchor. It never performs a numeric PID/PGID operation after wrapper close.
export function createBoundedChildLifecycle({ timeoutMs, graceMs = 2_000, dependencies = {} }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("Bounded child timeout must be a positive integer");
  if (!Number.isInteger(graceMs) || graceMs < 1) throw new Error("Bounded child grace must be a positive integer");
  const spawn = dependencies.spawn ?? nodeSpawn;
  const awaitFor = dependencies.waitFor ?? waitFor;
  const sleep = dependencies.sleep ?? delay;
  const makeNonce = dependencies.nonce ?? (() => randomBytes(24).toString("base64url"));
  let active = null;
  let token = { verified: true, noProcess: true };

  const failure = (message) => Object.assign(new Error(`closure_unverified: ${message}`), { closureFailure: true });

  function send(record, message) {
    if (!record.child.stdin?.writable) throw failure("epoch wrapper control channel is unavailable");
    record.child.stdin.write(`${JSON.stringify({ nonce: record.nonce, ...message })}\n`);
  }

  async function finalize(record) {
    if (!record.result) throw failure("epoch wrapper did not send RESULT");
    send(record, { type: "FINALIZE" });
    const close = await awaitFor(record.closed, graceMs + 250);
    if (close.timedOut) throw failure("epoch wrapper did not self-finalize");
    if (!record.finalized || record.closeSignal !== "SIGKILL") throw failure("epoch wrapper close lacks matching FINALIZE/SIGKILL proof");
    record.verified = true;
    token = { verified: true, nonce: record.nonce, finalizedBy: "SIGKILL" };
    if (active === record) active = null;
    return token;
  }

  async function close(record, signal = "SIGTERM") {
    if (!record.result) {
      send(record, { type: "CANCEL", signal });
      const result = await awaitFor(record.resultPromise, timeoutMs + graceMs + 250);
      if (result.timedOut) throw failure("epoch wrapper did not return RESULT after CANCEL");
    }
    return finalize(record);
  }

  async function run(command, args, { cwd, env, stdio = "pipe" } = {}) {
    if (active) throw new Error("Only one bounded child may be active per lifecycle");
    token = { verified: false };
    const nonce = makeNonce();
    const payload = Buffer.from(JSON.stringify({ command, args, cwd, env, timeoutMs, graceMs })).toString("base64url");
    let child;
    try {
      child = spawn(process.execPath, [wrapper.pathname], {
        cwd,
        env: { ...process.env, OWNED_PROCESS_EPOCH_NONCE: nonce, OWNED_PROCESS_EPOCH_COMMAND: payload },
        stdio: ["pipe", "pipe", stdio === "inherit" ? "inherit" : "pipe"],
        detached: true,
      });
    } catch (error) {
      token = { verified: true, preSpawnFailure: true };
      throw error;
    }
    const record = { child, nonce, ready: false, result: null, finalized: false, verified: false, closeSignal: null };
    active = record;
    let resolveResult;
    record.resultPromise = new Promise((resolve) => { resolveResult = resolve; });
    let resolveClose;
    record.closed = new Promise((resolve) => { resolveClose = resolve; });
    let lines = "";
    child.stdout?.on("data", (chunk) => {
      lines += chunk;
      for (;;) {
        const newline = lines.indexOf("\n");
        if (newline < 0) break;
        const line = lines.slice(0, newline); lines = lines.slice(newline + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        if (message?.nonce !== nonce) continue;
        if (message.type === "READY") record.ready = true;
        if (message.type === "RESULT" && !record.result) { record.result = message; resolveResult(message); }
        if (message.type === "FINALIZE") record.finalized = true;
      }
    });
    child.once("close", (_code, signal) => { record.closeSignal = signal; resolveClose(); });
    child.once("error", () => { resolveClose(); });
    const ready = await awaitFor(new Promise((resolveReady) => {
      const timer = setInterval(() => { if (record.ready) { clearInterval(timer); resolveReady(); } }, 1);
    }), graceMs + 250);
    // The stdout parser consumes READY, so use the authenticated transcript
    // marker only to bound readiness. A missing READY cannot authorize cleanup.
    if (ready.timedOut) throw failure("epoch wrapper did not send READY");
    try {
      const result = await awaitFor(record.resultPromise, timeoutMs + graceMs + 250);
      if (result.timedOut) throw failure("epoch wrapper internal timeout did not produce RESULT");
      const closure = await finalize(record);
      const stdout = Buffer.from(record.result.stdout ?? "", "base64url").toString();
      const stderr = Buffer.from(record.result.stderr ?? "", "base64url").toString();
      if (record.result.kind === "exit" && record.result.code === 0) return { stdout, stderr, closure };
      if (record.result.kind === "timeout") throw new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`);
      if (record.result.kind === "exit") throw new Error(`${command} ${args.join(" ")} failed (${record.result.signal ?? record.result.code})`);
      throw new Error(record.result.message ?? `${command} failed to spawn`);
    } catch (error) {
      if (error?.closureFailure) throw error;
      if (!record.verified) {
        try { await close(record); } catch (closureError) { throw composePrimaryAndClosureFailure(error, closureError); }
      }
      throw error;
    }
  }

  return {
    run,
    shutdown: async (signal = "SIGTERM") => active ? close(active, signal) : token,
    closureToken: () => token,
    hasActiveOwnership: () => active !== null,
  };
}
