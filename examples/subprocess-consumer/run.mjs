import { join, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import {
  acquireTempRoot,
  composePrimaryAndClosureFailure,
  createBoundedChildLifecycle,
  removeAcquiredTempRoot,
} from "../../scripts/browser-acceptance/owned-temp-root.mjs";

const cli = resolve("bin/social-metadata.js");
const tempRoot = await acquireTempRoot({
  prefix: "social-metadata-consumer-",
  borrowedRoot: process.env.SOCIAL_METADATA_RELEASE_ROOT,
  descendant: "subprocess-consumer",
});
const stateRoot = join(tempRoot.path, "state");
const runId = `run_subprocess_${process.pid}`;
const capturedAt = new Date().toISOString();
const commandTimeoutMs = boundedInteger("SUBPROCESS_CONSUMER_COMMAND_TIMEOUT_MS", "90000", 90_000);
const childGraceMs = boundedInteger("SUBPROCESS_CONSUMER_CHILD_GRACE_MS", "2000", 10_000);
const lifecycle = createBoundedChildLifecycle({ timeoutMs: commandTimeoutMs, graceMs: childGraceMs });
let terminatingSignal = null;
let cleanupPromise = null;

function boundedInteger(name, fallback, maximum) {
  const milliseconds = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > maximum) {
    throw new Error(`${name} must be a finite integer from 1 to ${maximum}`);
  }
  return milliseconds;
}

async function invoke(args) {
  const { stdout, stderr } = await lifecycle.run(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
  });
  const lines = stdout.trim().split("\n");
  if (lines.length !== 1) throw new Error(`Expected one JSON stdout line; stderr=${stderr}`);
  const envelope = JSON.parse(lines[0]);
  if (!envelope.ok) throw new Error(`CLI failed: ${JSON.stringify(envelope.errors)}`);
  return envelope;
}

async function cleanup(signal = null) {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    await lifecycle.shutdown(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
    await removeAcquiredTempRoot(tempRoot, lifecycle.closureToken());
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

const startupDelayMs = boundedInteger("SUBPROCESS_CONSUMER_START_DELAY_MS", "1", 10_000);
if (process.env.SUBPROCESS_CONSUMER_READY_FILE) {
  await writeFile(process.env.SUBPROCESS_CONSUMER_READY_FILE, "ready\n");
}
if (startupDelayMs > 1) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, startupDelayMs));
}

function observation(channelRunId, id, kind, payload, typedText) {
  return {
    contractVersion: "1.0",
    observationId: id,
    runId,
    channelRunId,
    capturedAt,
    source: {
      kind: "browser_ui",
      channel: "youtube",
      browser: "chrome",
      accessMode: "authenticated",
      uiLocale: "en-US",
      region: "US",
      timezone: "America/Phoenix",
      personalizedSession: true,
      surface: kind === "suggestion_set" ? "autocomplete" : "search_results",
    },
    module: { name: "search-term", schemaVersion: "1.0" },
    kind,
    ...(typedText ? { query: { typedText } } : {}),
    payload,
  };
}

let successOutput;
let primaryFailure;
try {
  const plan = await invoke([
    "plan",
    "--state-root",
    stateRoot,
    "--json",
    JSON.stringify({
      contractVersion: "1.0",
      runId,
      creativeBrief: { summary: "Practical remote-work habits for small software teams." },
      inputReferences: [],
      channels: ["youtube"],
      locale: { uiLocale: "en-US", region: "US", timezone: "America/Phoenix" },
      orchestrationMode: "automatic",
      enabledModules: ["search-term"],
      defaultEvidenceTier: "autocomplete_only",
      browserSelection: { browser: "chrome", confirmedByUser: true },
      approvedPrefixes: { youtube: { "search-term": ["remote work"] } },
      interactionBounds: {
        maxPrefixesPerModule: 3,
        maxSuggestionsPerPrefix: 10,
        maxResultsPerCandidate: 3,
        maxRefinementRounds: 1,
      },
    }),
  ]);
  const channelRunId = plan.data.plan.channelRuns[0].channelRunId;
  const suggestionId = "obs_subprocess_suggestion";
  const observations = [
    observation(channelRunId, "obs_subprocess_session", "session_state", { ready: true, authenticated: true }),
    observation(channelRunId, suggestionId, "suggestion_set", {
      suggestions: [{ displayedValue: "remote work tips", displayPosition: 1 }],
      stoppingReason: "visible_list_exhausted",
      round: 0,
    }, "remote work"),
    observation(channelRunId, "obs_subprocess_decision", "recommendation_decision", {
      decision: "selected",
      candidate: "remote work tips",
      rationale: "The exact native suggestion matches the supplied creative context.",
      suggestionEvidenceIds: [suggestionId],
      resultEvidenceIds: [],
      origin: "native",
      seedProvenance: { kind: "creative_brief", value: "remote work" },
    }),
  ];
  for (const item of observations) {
    await invoke([
      "record-observation",
      "--run",
      runId,
      "--state-root",
      stateRoot,
      "--json",
      JSON.stringify(item),
    ]);
  }
  const validated = await invoke(["validate", "--run", runId, "--state-root", stateRoot]);
  successOutput = `${JSON.stringify({
    ok: true,
    contractVersion: validated.contractVersion,
    runId,
    status: validated.data.status,
    channel: validated.data.receipt.channel,
    recommendation: validated.data.receipt.moduleResults["search-term"].researchedRecommendations[0].displayedValue,
    consumedFrom: "stdout_json_only",
  })}\n`;
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

if (!terminatingSignal) process.stdout.write(successOutput);
