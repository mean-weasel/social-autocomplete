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

test("an explicit channel-run selection finalizes a truthful UI-change receipt and advances", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-ui-finalize-"));
  const request = JSON.parse(
    await readFile(join(fixtureRoot, "plan-request.json"), "utf8"),
  ) as Record<string, any>;
  request.runId = "run_ui_finalize";
  request.channels = ["youtube", "x"];
  request.approvedPrefixes = {
    youtube: { "search-term": ["remote work"] },
    x: { "search-term": ["remote work"] },
  };
  const created = await executeCommand(
    parseArguments(["plan", "--json", JSON.stringify(request)]),
    cwd,
  );
  const plan = (created.envelope.data as Record<string, any>).plan;
  const firstChannelRunId = plan.channelRuns[0].channelRunId as string;
  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const interruption = JSON.parse(
    template.replace("$CHANNEL_RUN_ID", firstChannelRunId),
  ) as Record<string, any>;
  interruption.runId = "run_ui_finalize";
  interruption.observationId = "obs_ui_finalize";
  interruption.capturedAt = new Date().toISOString();
  interruption.kind = "interruption";
  interruption.payload = { reason: "ui_change" };
  await executeCommand(
    parseArguments([
      "record-observation",
      "--run",
      "run_ui_finalize",
      "--json",
      JSON.stringify(interruption),
    ]),
    cwd,
  );

  const defaultResult = await executeCommand(
    parseArguments(["validate", "--run", "run_ui_finalize"]),
    cwd,
  );
  assert.equal(defaultResult.exitCode, 5);
  assert.equal(
    (defaultResult.envelope.data as Record<string, any>).requiresAssistedResume,
    true,
  );

  const finalized = await executeCommand(
    parseArguments([
      "validate",
      "--run",
      "run_ui_finalize",
      "--channel-run",
      firstChannelRunId,
    ]),
    cwd,
  );
  assert.equal(finalized.exitCode, 5);
  assert.equal((finalized.envelope.data as Record<string, any>).receipt.status, "failed");
  assert.equal(
    (finalized.envelope.data as Record<string, any>).nextAction.channel,
    "x",
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

test("browser selection is required, user-confirmed, and compatible with the first channel", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-browser-required-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, any>;
  request.runId = "run_browser_required";
  delete request.browserSelection;
  await assert.rejects(
    executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd),
    (error: any) => error.issues.some((issue: any) => issue.code === "invalid_object"),
  );

  request.browserSelection = { browser: "chrome", confirmedByUser: false };
  await assert.rejects(
    executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd),
    (error: any) =>
      error.issues.some((issue: any) => issue.code === "browser_selection_not_confirmed"),
  );

  request.browserSelection = { browser: "in_app", confirmedByUser: true };
  request.channels = ["facebook"];
  await assert.rejects(
    executeCommand(parseArguments(["plan", "--json", JSON.stringify(request)]), cwd),
    (error: any) => error.issues.some((issue: any) => issue.code === "browser_not_supported"),
  );
});

test("new runs keep independent ordered channels while resume reuses the same run plan", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-channel-isolation-"));
  const template = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, any>;

  const firstRequest = structuredClone(template);
  firstRequest.runId = "run_channel_isolation_a";
  firstRequest.channels = ["facebook", "x"];
  firstRequest.browserSelection = { browser: "chrome", confirmedByUser: true };
  const first = await executeCommand(
    parseArguments(["plan", "--json", JSON.stringify(firstRequest)]),
    cwd,
  );

  const secondRequest = structuredClone(template);
  secondRequest.runId = "run_channel_isolation_b";
  secondRequest.channels = ["youtube"];
  secondRequest.browserSelection = { browser: "chrome", confirmedByUser: true };
  const second = await executeCommand(
    parseArguments(["plan", "--json", JSON.stringify(secondRequest)]),
    cwd,
  );

  assert.deepEqual(
    (first.envelope.data as Record<string, any>).plan.channels,
    ["facebook", "x"],
  );
  assert.deepEqual(
    (second.envelope.data as Record<string, any>).plan.channels,
    ["youtube"],
  );

  const resumedFirst = await executeCommand(
    parseArguments(["plan", "--run", "run_channel_isolation_a"]),
    cwd,
  );
  const resumedSecond = await executeCommand(
    parseArguments(["plan", "--run", "run_channel_isolation_b"]),
    cwd,
  );
  assert.deepEqual(
    (resumedFirst.envelope.data as Record<string, any>).plan.channels,
    ["facebook", "x"],
  );
  assert.deepEqual(
    (resumedSecond.envelope.data as Record<string, any>).plan.channels,
    ["youtube"],
  );
});

test("next actions preserve the browser choice and request an amendment for an incompatible later channel", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-browser-next-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, any>;
  request.runId = "run_browser_next";
  request.channels = ["youtube", "facebook"];
  request.browserSelection = { browser: "in_app", confirmedByUser: true };
  const created = await executeCommand(
    parseArguments(["plan", "--json", JSON.stringify(request)]),
    cwd,
  );
  const data = created.envelope.data as Record<string, any>;
  assert.deepEqual(data.effectiveBrowserSelection, request.browserSelection);
  assert.deepEqual(data.nextAction.browserSelection, request.browserSelection);
  assert.equal(data.nextAction.kind, "record_observation");
  await new StateStore(cwd).writeReceipt(
    "run_browser_next",
    data.plan.channelRuns[0].channelRunId,
    { fixture: true },
  );
  const resumed = await executeCommand(
    parseArguments(["plan", "--run", "run_browser_next"]),
    cwd,
  );
  const nextAction = (resumed.envelope.data as Record<string, any>).nextAction;
  assert.equal(nextAction.kind, "amend_browser_selection");
  assert.equal(nextAction.channel, "facebook");
  assert.deepEqual(nextAction.allowedBrowsers, ["chrome"]);
});

test("browser selection can be amended before evidence and is enforced for observations", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-browser-amend-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, any>;
  request.runId = "run_browser_amend";
  const created = await executeCommand(
    parseArguments(["plan", "--json", JSON.stringify(request)]),
    cwd,
  );
  const channelRunId = (created.envelope.data as Record<string, any>).plan.channelRuns[0].channelRunId as string;
  const amendment = {
    contractVersion: "1.0",
    amendmentId: "amend_browser_in_app",
    runId: "run_browser_amend",
    reason: "The user chose the Codex built-in Browser.",
    changes: { browserSelection: { browser: "in_app", confirmedByUser: true } },
  };
  const amended = await executeCommand(
    parseArguments(["plan", "--run", "run_browser_amend", "--json", JSON.stringify(amendment)]),
    cwd,
  );
  assert.deepEqual(
    (amended.envelope.data as Record<string, any>).effectiveBrowserSelection,
    amendment.changes.browserSelection,
  );

  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const observation = JSON.parse(template.replace("$CHANNEL_RUN_ID", channelRunId)) as Record<string, any>;
  observation.runId = "run_browser_amend";
  observation.capturedAt = new Date().toISOString();
  observation.source.browser = "chrome";
  await assert.rejects(
    executeCommand(
      parseArguments(["record-observation", "--run", "run_browser_amend", "--json", JSON.stringify(observation)]),
      cwd,
    ),
    (error: any) =>
      error.issues.some((issue: any) => issue.code === "browser_selection_mismatch"),
  );

  observation.source.browser = "in_app";
  observation.source.accessMode = "authenticated";
  await assert.rejects(
    executeCommand(
      parseArguments(["record-observation", "--run", "run_browser_amend", "--json", JSON.stringify(observation)]),
      cwd,
    ),
    (error: any) =>
      error.issues.some((issue: any) => issue.code === "in_app_requires_public_access"),
  );
});

test("browser selection is adjustable after an interruption but locked after native evidence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-browser-lock-"));
  const request = JSON.parse(await readFile(join(fixtureRoot, "plan-request.json"), "utf8")) as Record<string, any>;
  request.runId = "run_browser_lock";
  const created = await executeCommand(
    parseArguments(["plan", "--json", JSON.stringify(request)]),
    cwd,
  );
  const channelRunId = (created.envelope.data as Record<string, any>).plan.channelRuns[0].channelRunId as string;
  const template = await readFile(join(fixtureRoot, "observation.template.json"), "utf8");
  const base = JSON.parse(template.replace("$CHANNEL_RUN_ID", channelRunId)) as Record<string, any>;
  base.runId = "run_browser_lock";
  base.capturedAt = new Date().toISOString();
  const interruption = {
    ...base,
    observationId: "obs_browser_interruption",
    kind: "interruption",
    payload: { reason: "authentication_required" },
  };
  await executeCommand(
    parseArguments(["record-observation", "--run", "run_browser_lock", "--json", JSON.stringify(interruption)]),
    cwd,
  );
  const toInApp = {
    contractVersion: "1.0",
    amendmentId: "amend_browser_after_interruption",
    runId: "run_browser_lock",
    reason: "The user chose public in-app research after the authentication pause.",
    changes: { browserSelection: { browser: "in_app", confirmedByUser: true } },
  };
  await executeCommand(
    parseArguments(["plan", "--run", "run_browser_lock", "--json", JSON.stringify(toInApp)]),
    cwd,
  );
  const session = {
    ...base,
    observationId: "obs_browser_session",
    kind: "session_state",
    source: { ...base.source, browser: "in_app", accessMode: "public", personalizedSession: false },
    payload: { ready: true, authenticated: false },
  };
  await executeCommand(
    parseArguments(["record-observation", "--run", "run_browser_lock", "--json", JSON.stringify(session)]),
    cwd,
  );
  const backToChrome = {
    ...toInApp,
    amendmentId: "amend_browser_after_evidence",
    reason: "Attempt a mid-channel switch.",
    changes: { browserSelection: { browser: "chrome", confirmedByUser: true } },
  };
  await assert.rejects(
    executeCommand(
      parseArguments(["plan", "--run", "run_browser_lock", "--json", JSON.stringify(backToChrome)]),
      cwd,
    ),
    (error: any) => error.issues.some((issue: any) => issue.code === "browser_selection_locked"),
  );
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
