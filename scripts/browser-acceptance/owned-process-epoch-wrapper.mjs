import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const nonce = process.env.OWNED_PROCESS_EPOCH_NONCE;
const encoded = process.env.OWNED_PROCESS_EPOCH_COMMAND;

if (!nonce || !encoded) throw new Error("epoch wrapper requires a nonce and command");
const { command, args, cwd, env, timeoutMs, graceMs } = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
if (!Number.isInteger(timeoutMs) || !Number.isInteger(graceMs)) throw new Error("epoch wrapper requires finite bounds");

const send = (message) => process.stdout.write(`${JSON.stringify({ nonce, ...message })}\n`);
const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
let resultSent = false;
let timer;
let graceTimer;
let requestedKind = null;

child.stdout?.on("data", (chunk) => { stdout += chunk; });
child.stderr?.on("data", (chunk) => { stderr += chunk; });

function result(kind, details = {}) {
  if (resultSent) return;
  resultSent = true;
  clearTimeout(timer);
  clearTimeout(graceTimer);
  send({ type: "RESULT", kind, stdout: Buffer.from(stdout).toString("base64url"), stderr: Buffer.from(stderr).toString("base64url"), ...details });
}

function requestStop(signal, kind) {
  if (resultSent) return;
  requestedKind ??= kind;
  try { child.kill(signal); } catch { /* child may have already closed */ }
  graceTimer = setTimeout(() => result(requestedKind, { signal }), graceMs);
}

child.once("error", (error) => result("spawn_error", { message: error.message }));
child.once("close", (code, signal) => result(requestedKind ?? "exit", { code, signal }));

timer = setTimeout(() => requestStop("SIGTERM", "timeout"), timeoutMs);

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message?.nonce !== nonce) return;
  if (message.type === "CANCEL") {
    requestStop(message.signal === "SIGINT" ? "SIGINT" : "SIGTERM", "cancelled");
    return;
  }
  if (message.type === "FINALIZE" && resultSent) {
    // This acknowledgement is the last protocol byte. The anchor is still
    // its live process-group leader when it self-finalizes the entire group.
    send({ type: "FINALIZE" });
    process.kill(0, "SIGKILL");
  }
});

send({ type: "READY" });
