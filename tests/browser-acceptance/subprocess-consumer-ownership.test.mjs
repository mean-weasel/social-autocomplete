import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repo = resolve(".");
const consumer = join(repo, "examples/subprocess-consumer/run.mjs");

async function waitFor(path) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { await access(path); return; } catch { await new Promise((resolveWait) => setTimeout(resolveWait, 10)); }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function invoke({ signal } = {}) {
  const parent = await mkdtemp(join(tmpdir(), "subprocess-consumer-test-"));
  const ready = join(parent, "ready");
  const child = spawn(process.execPath, [consumer], {
    cwd: repo,
    env: {
      ...process.env,
      SOCIAL_METADATA_RELEASE_ROOT: parent,
      SUBPROCESS_CONSUMER_READY_FILE: ready,
      SUBPROCESS_CONSUMER_START_DELAY_MS: signal ? "10000" : "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await waitFor(ready);
    if (signal) child.kill(signal);
    const result = await new Promise((resolveClose, rejectClose) => {
      const timeout = setTimeout(() => rejectClose(new Error("consumer did not exit")), 15_000);
      child.once("close", (code, closeSignal) => {
        clearTimeout(timeout);
        resolveClose({ code, closeSignal });
      });
    });
    await assert.doesNotReject(access(parent));
    await assert.rejects(access(join(parent, "subprocess-consumer")));
    return { ...result, stdout, stderr };
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

test("consumer cleans only its borrowed descendant before emitting success", { timeout: 20_000 }, async () => {
  const result = await invoke();
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.closeSignal, null);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("consumer SIGINT and SIGTERM clean its borrowed descendant and preserve conventional statuses", { timeout: 30_000 }, async () => {
  const interrupt = await invoke({ signal: "SIGINT" });
  assert.equal(interrupt.code, 130, interrupt.stderr);
  assert.equal(interrupt.stdout, "");
  const terminate = await invoke({ signal: "SIGTERM" });
  assert.equal(terminate.code, 143, terminate.stderr);
  assert.equal(terminate.stdout, "");
});
