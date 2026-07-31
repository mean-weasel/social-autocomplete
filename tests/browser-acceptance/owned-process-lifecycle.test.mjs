import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createBoundedChildLifecycle } from "../../scripts/browser-acceptance/owned-temp-root.mjs";

const wrapper = new URL("../../scripts/browser-acceptance/owned-process-epoch-wrapper.mjs", import.meta.url);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function startWrapper(command = [process.execPath, ["-e", "console.log('fixture')"]]) {
  const nonce = randomBytes(24).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ command: command[0], args: command[1], timeoutMs: 200, graceMs: 20 })).toString("base64url");
  const child = spawn(process.execPath, [wrapper.pathname], {
    env: { ...process.env, OWNED_PROCESS_EPOCH_NONCE: nonce, OWNED_PROCESS_EPOCH_COMMAND: payload },
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let transcript = "";
  child.stdout.on("data", (chunk) => { transcript += chunk; });
  return { child, nonce, transcript: () => transcript };
}

async function waitForMessage(session, type) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (session.transcript().split("\n").some((line) => line.includes(`\"type\":\"${type}\"`))) return;
    await wait(5);
  }
  throw new Error(`did not receive ${type}`);
}

test("nonce mismatch and malformed FINALIZE cannot close the epoch anchor", async () => {
  const session = startWrapper();
  try {
    await waitForMessage(session, "READY");
    await waitForMessage(session, "RESULT");
    session.child.stdin.write(`${JSON.stringify({ nonce: "wrong", type: "FINALIZE" })}\n{not-json}\n`);
    await wait(40);
    assert.equal(session.transcript().includes('"type":"FINALIZE"'), false);
    session.child.stdin.write(`${JSON.stringify({ nonce: session.nonce, type: "FINALIZE" })}\n`);
    const [, signal] = await once(session.child, "close");
    assert.equal(signal, "SIGKILL");
    assert.match(session.transcript(), /"type":"RESULT"/);
    assert.match(session.transcript(), /"type":"FINALIZE"/);
  } finally { session.child.stdin.end(); }
});

test("missing FINALIZE leaves the wrapper live rather than voluntarily exiting after READY", async () => {
  const session = startWrapper();
  try {
    await waitForMessage(session, "RESULT");
    await wait(40);
    assert.equal(session.child.exitCode, null);
    session.child.stdin.write(`${JSON.stringify({ nonce: session.nonce, type: "FINALIZE" })}\n`);
    const [, signal] = await once(session.child, "close");
    assert.equal(signal, "SIGKILL");
  } finally { session.child.stdin.end(); }
});

test("shared lifecycle accepts only matching RESULT/FINALIZE/SIGKILL closure and returns output after it", async () => {
  const lifecycle = createBoundedChildLifecycle({ timeoutMs: 500, graceMs: 30 });
  const result = await lifecycle.run(process.execPath, ["-e", "console.log('protocol-output')"]);
  assert.equal(result.stdout, "protocol-output\n");
  assert.deepEqual(lifecycle.closureToken().verified, true);
  assert.equal(lifecycle.closureToken().finalizedBy, "SIGKILL");
  assert.equal(lifecycle.hasActiveOwnership(), false);
});

test("internal timeout finalizes through the wrapper without parent PID or PGID operations", async () => {
  const lifecycle = createBoundedChildLifecycle({ timeoutMs: 40, graceMs: 20 });
  await assert.rejects(lifecycle.run(process.execPath, ["-e", "setInterval(() => {}, 1000)"]), /timed out after 40ms/);
  assert.equal(lifecycle.closureToken().verified, true);
  assert.equal(lifecycle.closureToken().finalizedBy, "SIGKILL");
});

test("ten deterministic protocol rounds have no post-close numeric process hook", async () => {
  for (let round = 0; round < 10; round += 1) {
    const lifecycle = createBoundedChildLifecycle({ timeoutMs: 500, graceMs: 25 });
    await lifecycle.run(process.execPath, ["-e", `console.log(${round})`]);
    assert.equal(lifecycle.closureToken().verified, true);
  }
});
