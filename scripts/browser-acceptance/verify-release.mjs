import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { summarizeLiveReceipts } from "./coverage.mjs";
import {
  acquireTempRoot,
  composePrimaryAndClosureFailure,
  createBoundedChildLifecycle,
  removeOwnedTempRoot,
} from "./owned-temp-root.mjs";

const allowMissing = process.argv.includes("--allow-missing-live-receipts");

function boundedInteger(name, fallback, maximum) {
  const milliseconds = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > maximum) {
    throw new Error(`${name} must be a finite integer from 1 to ${maximum}`);
  }
  return milliseconds;
}

// This outer lifecycle bound deliberately exceeds the install smoke's
// command-specific 180-second epoch deadline.
const commandTimeoutMs = boundedInteger("QA_RELEASE_COMMAND_TIMEOUT_MS", "240000", 240_000);
const childGraceMs = boundedInteger("QA_RELEASE_CHILD_GRACE_MS", "2000", 10_000);
const releaseRoot = await acquireTempRoot({ prefix: "social-metadata-release-codex-" });
const lifecycle = createBoundedChildLifecycle({ timeoutMs: commandTimeoutMs, graceMs: childGraceMs });
let terminatingSignal = null;
let cleanupPromise = null;
const commands = process.env.QA_RELEASE_TEST_COMMANDS_JSON
  ? JSON.parse(process.env.QA_RELEASE_TEST_COMMANDS_JSON)
  : [
    ["npm", ["run", "verify:offline"]],
    ["npm", ["run", "test:diagnostics"]],
    ["npm", ["run", "test:browser-harness"]],
    ["npm", ["run", "test:install"]],
    ["claude", ["plugin", "validate", "--strict", "."]],
    ["npm", ["run", "example:subprocess"]],
  ];

async function cleanup(signal = null) {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    await lifecycle.shutdown(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
    await removeOwnedTempRoot(releaseRoot, lifecycle.closureToken());
  })();
  return cleanupPromise;
}

async function interrupt(signal) {
  if (terminatingSignal) return;
  terminatingSignal = signal;
  try {
    await cleanup(signal);
    process.exit(signal === "SIGINT" ? 130 : 143);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

process.once("SIGINT", () => { void interrupt("SIGINT"); });
process.once("SIGTERM", () => { void interrupt("SIGTERM"); });

let success;
let primaryFailure;
try {
  for (const [command, args] of commands) {
    await lifecycle.run(command, args, {
      cwd: resolve("."),
      stdio: "inherit",
      env: { ...process.env, SOCIAL_METADATA_RELEASE_ROOT: releaseRoot.path },
    });
    if (terminatingSignal) break;
  }
  if (terminatingSignal) await new Promise(() => {});

  const receiptDir = resolve("docs/browser-acceptance/receipts");
  let receiptFiles = [];
  try {
    receiptFiles = (await readdir(receiptDir)).filter((name) => name.endsWith(".json"));
  } catch {
    receiptFiles = [];
  }
  const receipts = [];
  for (const file of receiptFiles) {
    const receipt = JSON.parse(await readFile(resolve(receiptDir, file), "utf8"));
    if (receipt.contractVersion !== "1.0" || receipt.receiptVersion !== "1.0") {
      throw new Error(`Invalid acceptance receipt version: ${file}`);
    }
    receipts.push(receipt);
  }
  const coverage = summarizeLiveReceipts(receipts);
  if (!coverage.requirementsMet && !allowMissing) {
    throw new Error(
      `Fresh live coverage is incomplete: channels=${coverage.missingChannels.join(",") || "none"}; passing modules=${coverage.missingPassingModules.join(",") || "none"}; public=${coverage.publicPass}; authenticated=${coverage.authenticatedPass}.`,
    );
  }
  success = {
    ok: true,
    offline: "pass",
    cleanInstall: "pass",
    subprocess: "pass",
    liveReceipts: { required: !allowMissing, ...coverage },
  };
} catch (error) {
  primaryFailure = error;
}

try {
  await cleanup();
} catch (closureError) {
  if (primaryFailure) throw composePrimaryAndClosureFailure(primaryFailure, closureError);
  throw closureError;
}

if (primaryFailure) throw primaryFailure;

process.stdout.write(`${JSON.stringify(success)}\n`);
