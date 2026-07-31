import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repo = resolve(".");
const release = join(repo, "scripts/browser-acceptance/verify-release.mjs");
const fixture = join(repo, "tests/browser-acceptance/fixtures/release-temp-child.mjs");

async function missing(path) {
  await assert.rejects(access(path));
}

async function waitForMissing(path) {
  for (let index = 0; index < 100; index += 1) {
    try {
      await missing(path);
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
  }
  throw new Error(`Timed out waiting for exact-root cleanup: ${path}`);
}

async function waitFor(path) {
  for (let index = 0; index < 100; index += 1) {
    try { await access(path); return; } catch { await new Promise((resolveWait) => setTimeout(resolveWait, 20)); }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function invoke(mode, { signal, timeout } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "release-temp-test-"));
  const record = join(directory, "root.txt");
  const sentinels = ["social-metadata-release-codex-sentinel", "social-metadata-install-sentinel", "social-metadata-consumer-sentinel"];
  for (const name of sentinels) {
    await mkdir(join(directory, name));
    await writeFile(join(directory, name, "keep"), name);
  }
  const commands = [[process.execPath, [fixture, mode]]];
  const child = spawn(process.execPath, [release, "--allow-missing-live-receipts"], {
    cwd: repo,
    env: {
      ...process.env,
      RELEASE_TEMP_RECORD: record,
      QA_RELEASE_COMMAND_TIMEOUT_MS: String(timeout ?? 5_000),
      QA_RELEASE_TEST_COMMANDS_JSON: JSON.stringify(commands),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolveClose, rejectClose) => {
    const deadline = setTimeout(() => rejectClose(new Error("release process did not exit")), 3_000);
    child.once("exit", (exitCode, exitSignal) => {
      clearTimeout(deadline);
      resolveClose([exitCode, exitSignal]);
    });
  });
  if (signal) {
    await waitFor(`${record}.ready`);
    child.kill(signal);
  }
  const [code, closeSignal] = await exited;
  const root = (await readFile(record, "utf8")).trim();
  let resistantPid;
  try {
    if (mode === "resistant") {
      resistantPid = Number((await readFile(`${record}.pid`, "utf8")).trim());
      // The fixture attempts recreation shortly after a cooperative grace
      // expiry. Let that attempt run before proving the group is gone.
      await new Promise((resolveWait) => setTimeout(resolveWait, 350));
      assert.throws(() => process.kill(resistantPid, 0), { code: "ESRCH" });
    }
    // The resistant fixture is a real owned-group escalation case. Its
    // post-SIGKILL ESRCH proof authorizes exact root removal; this differs
    // from the injected EPERM lifecycle test, which must retain its root.
    try { await waitForMissing(root); } catch (error) { throw new Error(`${error.message}: ${root}`); }
    for (const name of sentinels) {
      assert.equal(await readFile(join(directory, name, "keep"), "utf8"), name);
    }
  } finally {
    if (resistantPid) {
      try { process.kill(-resistantPid, "SIGKILL"); } catch { /* already closed */ }
    }
    await rm(directory, { recursive: true, force: true });
  }
  return { code, closeSignal, stdout, stderr };
}

test("release removes its exact root before reporting success and preserves sentinels", async () => {
  const result = await invoke("success");
  assert.equal(result.code, 0);
  assert.equal(result.closeSignal, null);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("release removes its exact root after a child error", async () => {
  const result = await invoke("error");
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, "");
});

test("release timeout sends bounded termination and removes its exact root", async () => {
  const result = await invoke("wait", { timeout: 50 });
  assert.notEqual(result.code, 0);
});

test("SIGINT and SIGTERM preserve conventional statuses after cleanup", async () => {
  const interrupt = await invoke("wait", { signal: "SIGINT" });
  assert.equal(interrupt.code, 130, interrupt.stderr);
  const terminate = await invoke("wait", { signal: "SIGTERM" });
  assert.equal(terminate.code, 143);
});

test("SIGINT and SIGTERM verify resistant owned-group escalation before root cleanup", async () => {
  const interrupt = await invoke("resistant", { signal: "SIGINT" });
  assert.equal(interrupt.code, 130, interrupt.stderr);
  const terminate = await invoke("resistant", { signal: "SIGTERM" });
  assert.equal(terminate.code, 143, terminate.stderr);
});
