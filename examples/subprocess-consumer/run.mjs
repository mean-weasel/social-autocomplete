import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = resolve("bin/social-metadata.js");
const stateRoot = await mkdtemp(join(tmpdir(), "social-metadata-consumer-"));
const runId = `run_subprocess_${process.pid}`;
const capturedAt = new Date().toISOString();

async function invoke(args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
  });
  const lines = stdout.trim().split("\n");
  if (lines.length !== 1) throw new Error(`Expected one JSON stdout line; stderr=${stderr}`);
  const envelope = JSON.parse(lines[0]);
  if (!envelope.ok) throw new Error(`CLI failed: ${JSON.stringify(envelope.errors)}`);
  return envelope;
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
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contractVersion: validated.contractVersion,
    runId,
    status: validated.data.status,
    channel: validated.data.receipt.channel,
    recommendation: validated.data.receipt.moduleResults["search-term"].researchedRecommendations[0].displayedValue,
    consumedFrom: "stdout_json_only",
  })}\n`);
} finally {
  await rm(stateRoot, { recursive: true, force: true });
}
