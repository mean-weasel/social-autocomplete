import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { executeCommand } from "../../src/cli/commands.js";
import { parseArguments } from "../../src/cli/arguments.js";
import { StateStore } from "../../src/state/store.js";

const fixtureRoot = resolve("fixtures/core");

test("plan, record-observation, resume, and validate form a durable round trip", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-core-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, unknown>;
  request.runId = "run_roundtrip";
  const planResult = await executeCommand(
    parseArguments(["plan", "--json", JSON.stringify(request)]),
    cwd,
  );
  assert.equal(planResult.exitCode, 0);
  assert.equal(planResult.envelope.ok, true);
  const planData = planResult.envelope.data as Record<string, any>;
  const channelRunId = planData.plan.channelRuns[0].channelRunId as string;

  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const observation = JSON.parse(template.replace("$CHANNEL_RUN_ID", channelRunId)) as Record<string, any>;
  observation.runId = "run_roundtrip";
  observation.capturedAt = new Date().toISOString();
  const session = {
    ...observation,
    observationId: "obs_core_session",
    kind: "session_state",
    query: undefined,
    payload: { ready: true, authenticated: true },
  };
  const decision = {
    ...observation,
    observationId: "obs_core_decision",
    kind: "recommendation_decision",
    query: undefined,
    payload: {
      decision: "selected",
      candidate: "remote work tips",
      rationale: "The exact native phrase matches the creative brief.",
      suggestionEvidenceIds: ["obs_core_fixture"],
      resultEvidenceIds: [],
      origin: "native",
    },
  };
  for (const item of [session, observation]) {
    await executeCommand(
      parseArguments(["record-observation", "--run", "run_roundtrip", "--json", JSON.stringify(item)]),
      cwd,
    );
  }
  const recordArgs = ["record-observation", "--run", "run_roundtrip", "--json", JSON.stringify(observation)];
  const recorded = await executeCommand(
    parseArguments(["record-observation", "--run", "run_roundtrip", "--json", JSON.stringify(decision)]),
    cwd,
  );
  assert.deepEqual((recorded.envelope.data as Record<string, unknown>).disposition, "recorded");
  const duplicate = await executeCommand(parseArguments(recordArgs), cwd);
  assert.deepEqual((duplicate.envelope.data as Record<string, unknown>).disposition, "duplicate");

  const resumed = await executeCommand(parseArguments(["plan", "--run", "run_roundtrip"]), cwd);
  assert.equal((resumed.envelope.data as Record<string, any>).nextAction.kind, "validate");

  const validated = await executeCommand(parseArguments(["validate", "--run", "run_roundtrip"]), cwd);
  assert.equal(validated.exitCode, 0);
  assert.equal((validated.envelope.data as Record<string, any>).status, "complete");
  assert.deepEqual(
    (validated.envelope.data as Record<string, any>).receipt.observationReferences,
    ["obs_core_session", "obs_core_fixture", "obs_core_decision"],
  );
  assert.equal((validated.envelope.data as Record<string, any>).receipt.status, "complete");
});

test("validate reports incomplete state with exit 3", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-incomplete-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, unknown>;
  request.runId = "run_incomplete";
  await executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd);
  const result = await executeCommand(parseArguments(["validate", "--run", "run_incomplete"]), cwd);
  assert.equal(result.exitCode, 3);
  assert.equal(result.envelope.ok, false);
  assert.equal((result.envelope.data as Record<string, unknown>).status, "incomplete");
});

test("duplicate observation ids reject changed content", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-conflict-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, unknown>;
  request.runId = "run_conflict";
  const created = await executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd);
  const channelRunId = (created.envelope.data as Record<string, any>).plan.channelRuns[0].channelRunId as string;
  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const observation = JSON.parse(template.replace("$CHANNEL_RUN_ID", channelRunId)) as Record<string, any>;
  observation.runId = "run_conflict";
  observation.capturedAt = new Date().toISOString();
  await executeCommand(
    parseArguments(["record-observation", "--run", "run_conflict", "--json", JSON.stringify(observation)]),
    cwd,
  );
  observation.payload.suggestions[0].displayPosition = 2;
  await assert.rejects(
    executeCommand(
      parseArguments(["record-observation", "--run", "run_conflict", "--json", JSON.stringify(observation)]),
      cwd,
    ),
    /Observation id conflict/u,
  );
});

test("partial module evidence cannot validate", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-partial-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, unknown>;
  request.runId = "run_partial";
  const created = await executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd);
  const channelRunId = (created.envelope.data as Record<string, any>).plan.channelRuns[0].channelRunId as string;
  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const observation = JSON.parse(template.replace("$CHANNEL_RUN_ID", channelRunId)) as Record<string, any>;
  observation.runId = "run_partial";
  observation.capturedAt = new Date().toISOString();
  await executeCommand(
    parseArguments(["record-observation", "--run", "run_partial", "--json", JSON.stringify(observation)]),
    cwd,
  );
  const result = await executeCommand(parseArguments(["validate", "--run", "run_partial"]), cwd);
  assert.equal(result.exitCode, 3);
  assert.equal((result.envelope.data as Record<string, any>).reason, "module_evidence_invalid");
});

test("authentication interruption resumes in the same run after a later native session", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-auth-resume-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, unknown>;
  request.runId = "run_auth_resume";
  const created = await executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd);
  const channelRunId = (created.envelope.data as Record<string, any>).plan.channelRuns[0].channelRunId as string;
  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const suggestion = JSON.parse(template.replace("$CHANNEL_RUN_ID", channelRunId)) as Record<string, any>;
  suggestion.runId = "run_auth_resume";
  suggestion.capturedAt = new Date().toISOString();
  const interruption = {
    ...suggestion,
    observationId: "obs_auth_pause",
    kind: "interruption",
    payload: { reason: "authentication_required" },
  };
  await executeCommand(
    parseArguments(["record-observation", "--run", "run_auth_resume", "--json", JSON.stringify(interruption)]),
    cwd,
  );
  assert.equal(
    (await executeCommand(parseArguments(["validate", "--run", "run_auth_resume"]), cwd)).exitCode,
    4,
  );
  const session = {
    ...suggestion,
    observationId: "obs_auth_session",
    kind: "session_state",
    payload: { ready: true, authenticated: true },
  };
  const decision = {
    ...suggestion,
    observationId: "obs_auth_decision",
    kind: "recommendation_decision",
    payload: {
      decision: "selected",
      candidate: "remote work tips",
      rationale: "The native phrase matches the creative brief.",
      suggestionEvidenceIds: ["obs_core_fixture"],
      resultEvidenceIds: [],
    },
  };
  for (const item of [session, suggestion, decision]) {
    await executeCommand(
      parseArguments(["record-observation", "--run", "run_auth_resume", "--json", JSON.stringify(item)]),
      cwd,
    );
  }
  assert.equal(
    (await executeCommand(parseArguments(["validate", "--run", "run_auth_resume"]), cwd)).exitCode,
    0,
  );
});

test("UI change requires an assisted-resume diagnostic before the run can continue", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-ui-resume-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, unknown>;
  request.runId = "run_ui_resume";
  const created = await executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd);
  const channelRunId = (created.envelope.data as Record<string, any>).plan.channelRuns[0].channelRunId as string;
  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const suggestion = JSON.parse(template.replace("$CHANNEL_RUN_ID", channelRunId)) as Record<string, any>;
  suggestion.runId = "run_ui_resume";
  suggestion.capturedAt = new Date().toISOString();
  const interruption = {
    ...suggestion,
    observationId: "obs_ui_pause",
    kind: "interruption",
    payload: { reason: "ui_change" },
  };
  const session = {
    ...suggestion,
    observationId: "obs_ui_session",
    kind: "session_state",
    payload: { ready: true },
  };
  for (const item of [interruption, session]) {
    await executeCommand(
      parseArguments(["record-observation", "--run", "run_ui_resume", "--json", JSON.stringify(item)]),
      cwd,
    );
  }
  assert.equal(
    (await executeCommand(parseArguments(["validate", "--run", "run_ui_resume"]), cwd)).exitCode,
    5,
  );
  const diagnostic = {
    ...suggestion,
    observationId: "obs_ui_assisted_resume",
    kind: "diagnostic",
    payload: { resolution: "assisted_resume", checkpointsRestored: true },
  };
  const decision = {
    ...suggestion,
    observationId: "obs_ui_decision",
    kind: "recommendation_decision",
    payload: {
      decision: "selected",
      candidate: "remote work tips",
      rationale: "The restored native surface returned this exact phrase.",
      suggestionEvidenceIds: ["obs_core_fixture"],
      resultEvidenceIds: [],
    },
  };
  for (const item of [diagnostic, suggestion, decision]) {
    await executeCommand(
      parseArguments(["record-observation", "--run", "run_ui_resume", "--json", JSON.stringify(item)]),
      cwd,
    );
  }
  assert.equal(
    (await executeCommand(parseArguments(["validate", "--run", "run_ui_resume"]), cwd)).exitCode,
    0,
  );
});

test("channel progression is driven by durable receipts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-channel-progress-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, any>;
  request.runId = "run_progress";
  request.channels = ["youtube", "x"];
  request.approvedPrefixes = {
    youtube: { "search-term": ["remote work"] },
    x: { "search-term": ["remote work"] },
  };
  const created = await executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd);
  const plan = (created.envelope.data as Record<string, any>).plan;
  const firstChannelRunId = plan.channelRuns[0].channelRunId as string;
  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const suggestion = JSON.parse(template.replace("$CHANNEL_RUN_ID", firstChannelRunId)) as Record<string, any>;
  suggestion.runId = "run_progress";
  suggestion.capturedAt = new Date().toISOString();
  const session = { ...suggestion, observationId: "obs_progress_session", kind: "session_state", payload: { ready: true } };
  const decision = {
    ...suggestion,
    observationId: "obs_progress_decision",
    kind: "recommendation_decision",
    payload: {
      decision: "selected",
      candidate: "remote work tips",
      rationale: "Exact current native evidence.",
      suggestionEvidenceIds: ["obs_core_fixture"],
      resultEvidenceIds: [],
    },
  };
  for (const item of [session, suggestion, decision]) {
    await executeCommand(
      parseArguments(["record-observation", "--run", "run_progress", "--json", JSON.stringify(item)]),
      cwd,
    );
  }
  const firstReceipt = await executeCommand(parseArguments(["validate", "--run", "run_progress"]), cwd);
  assert.equal(firstReceipt.exitCode, 0);
  assert.equal(
    (firstReceipt.envelope.data as Record<string, any>).nextAction.channelRunId,
    plan.channelRuns[1].channelRunId,
  );
  const resumed = await executeCommand(parseArguments(["plan", "--run", "run_progress"]), cwd);
  assert.equal(
    (resumed.envelope.data as Record<string, any>).nextAction.channelRunId,
    plan.channelRuns[1].channelRunId,
  );
});

test("plan amendments are append-only and idempotent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-amendment-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, unknown>;
  request.runId = "run_amendment";
  await executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd);
  const amendment = {
    contractVersion: "1.0",
    amendmentId: "amendment_1",
    runId: "run_amendment",
    reason: "User approved a refined prefix.",
    changes: { approvedPrefixes: { youtube: { hashtag: ["#remoteleadership"] } } },
  };
  const first = await executeCommand(
    parseArguments(["plan", "--run", "run_amendment", "--json", JSON.stringify(amendment)]),
    cwd,
  );
  assert.equal((first.envelope.data as Record<string, any>).amendment, "recorded");
  const replay = await executeCommand(
    parseArguments(["plan", "--run", "run_amendment", "--json", JSON.stringify(amendment)]),
    cwd,
  );
  assert.equal((replay.envelope.data as Record<string, any>).amendment, "duplicate");
});

test("project-local state uses the common Git exclude in a linked worktree", async () => {
  const root = await mkdtemp(join(tmpdir(), "social-metadata-worktree-"));
  const commonGitDir = join(root, "repo.git");
  const worktreeGitDir = join(commonGitDir, "worktrees", "fixture");
  await mkdir(join(commonGitDir, "info"), { recursive: true });
  await mkdir(worktreeGitDir, { recursive: true });
  await writeFile(join(root, ".git"), `gitdir: ${worktreeGitDir}\n`, "utf8");
  await writeFile(join(worktreeGitDir, "commondir"), "../..\n", "utf8");
  await new StateStore(root).initialize();
  const exclude = await readFile(join(commonGitDir, "info", "exclude"), "utf8");
  assert.match(exclude, /^\.social-metadata\/$/mu);
});
