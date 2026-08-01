import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import {
  QA_CAMPAIGN_SCOPE,
  advanceQaCampaignPins,
  assertQaCampaignActiveChildGrant,
  assertQaCampaignChildGrant,
  assertQaCampaignState,
  authorizeQaCampaign,
  campaignAuthorizationPhrase,
  campaignPinsSha256,
  campaignResumePhrase,
  campaignRevocationPhrase,
  campaignScopeSha256,
  campaignChildGrantSha256,
  createQaCampaignState,
  createQaReplacementCampaignState,
  expireQaCampaign,
  issueQaCampaignChildGrant,
  parseQaStrictJson,
  qaCampaignClaimPath,
  recordQaCampaignChildTerminal,
  resumeQaCampaign,
  revokeQaCampaign,
  qaCampaignStateSha256,
  assertSanitizedTerminalReceiptStrings,
  suspendQaCampaign,
} from "../../scripts/browser-acceptance/qa-campaign.mjs";
import {
  assertQaManagerRunState,
  createQaManagerRunState,
} from "../../scripts/browser-acceptance/qa-recovery.mjs";

const execFileAsync = promisify(execFile);
const script = resolve("scripts/browser-acceptance/qa-campaign.mjs");
const H = {
  scenario: "1".repeat(64),
  oracle: "2".repeat(64),
  protocol: "3".repeat(64),
  runReducer: "4".repeat(64),
  campaignReducer: "5".repeat(64),
  scenarioSchema: "6".repeat(64),
};

function pins(suffix = "a") {
  return {
    productCommit: suffix.repeat(40),
    productTree: "b".repeat(40),
    qaCommit: "c".repeat(40),
    qaTree: "d".repeat(40),
    scenarioSha256: H.scenario,
    oracleSha256: H.oracle,
    protocolSha256: H.protocol,
    runReducerSha256: H.runReducer,
    campaignReducerSha256: H.campaignReducer,
    scenarioSchemaSha256: H.scenarioSchema,
  };
}

function spec(campaignId = "campaign_01") {
  return {
    campaignId,
    campaignScopeSha256: campaignScopeSha256(),
    createdAt: "2026-07-30T00:00:00.000Z",
    expiresAt: "2026-08-06T00:00:00.000Z",
    immutableScope: structuredClone(QA_CAMPAIGN_SCOPE),
    pins: pins(),
  };
}

function activeState(campaignId = "campaign_01") {
  const pending = createQaCampaignState(spec(campaignId));
  return authorizeQaCampaign(pending, {
    phrase: campaignAuthorizationPhrase(
      pending.campaign.campaignId,
      pending.campaign.campaignScopeSha256,
    ),
    at: "2026-07-30T00:01:00.000Z",
  });
}

function suspendedPredecessor(campaignId = "campaign_predecessor") {
  let state = activeState(campaignId);
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const issuance = issueQaCampaignChildGrant(
      state,
      childRequest(state, ordinal),
    );
    state = recordQaCampaignChildTerminal(
      issuance.state,
      terminalEvidence(issuance.grant),
    );
  }
  return suspendQaCampaign(state, {
    reason: "authorization_machinery_changed",
    at: "2026-07-30T00:10:00.000Z",
  });
}

function replacementSpec(campaignId = "campaign_replacement") {
  return {
    campaignId,
    createdAt: "2026-07-30T00:11:00.000Z",
    expiresAt: "2026-08-06T00:11:00.000Z",
    immutableScope: structuredClone(QA_CAMPAIGN_SCOPE),
    pins: {
      ...pins("e"),
      protocolSha256: "7".repeat(64),
      runReducerSha256: "8".repeat(64),
    },
  };
}

function childRequest(state, ordinal = state.budget.issuedCount + 1, runStatePath = null) {
  return {
    campaignId: state.campaign.campaignId,
    campaignScopeSha256: state.campaign.campaignScopeSha256,
    expectedPinsSha256: state.pins.currentSha256,
    runId: `qa_campaign_child_${ordinal}`,
    runStatePathSha256: createHash("sha256")
      .update(runStatePath ? resolve(runStatePath) : `private-run-path-${ordinal}`)
      .digest("hex"),
    scenarioId: "chrome_instagram_facebook_linkedin_autocomplete",
    scenarioSha256: state.pins.current.scenarioSha256,
    oracleId: "chrome_authenticated_research_v2",
    oracleSha256: state.pins.current.oracleSha256,
    protocolVersion: "qa-manager-worker/v1",
    protocolSha256: state.pins.current.protocolSha256,
    browser: "chrome",
    channels: ["instagram", "facebook", "linkedin"],
    issuedAt: `2026-07-30T00:${String(ordinal * 2).padStart(2, "0")}:00.000Z`,
  };
}

function terminalEvidence(grant, ordinal = grant.ordinal) {
  return {
    runId: grant.runId,
    ordinal,
    grantSha256: grant.grantSha256,
    terminalResultId: "run_stopped",
    disposition: "blocked",
    authorizationConsumed: true,
    targetDisposition: "terminal_ambiguity",
    receiptSha256: createHash("sha256")
      .update(`receipt-${ordinal}`)
      .digest("hex"),
    terminalAt: `2026-07-30T00:${String((ordinal * 2) + 1).padStart(2, "0")}:00.000Z`,
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function cli(args, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], {
      env: { ...process.env, ...options.env },
      maxBuffer: 1024 * 1024,
    });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      status: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

test("campaign state is schema-valid, private, exact-scope, and seven-day bounded", async () => {
  const state = createQaCampaignState(spec());
  assertQaCampaignState(state);
  const schema = JSON.parse(
    await readFile(
      "docs/browser-acceptance/schemas/qa-manager-campaign-state.schema.json",
      "utf8",
    ),
  );
  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(state), true, JSON.stringify(validate.errors));
  assert.equal(state.budget.limit, 10);
  assert.equal(state.budget.issuedCount, 0);
  assert.equal(JSON.stringify(state).includes("https://"), false);
  assert.throws(
    () =>
      createQaCampaignState({
        ...spec(),
        expiresAt: "2026-08-06T00:00:00.001Z",
      }),
    /seven days/,
  );
  assert.throws(
    () =>
      createQaCampaignState({
        ...spec(),
        immutableScope: { ...QA_CAMPAIGN_SCOPE, childLimit: 11 },
      }),
    /scope mismatch/,
  );
});

test("replacement campaign carries four consumed slots and grants exactly series ordinals five through ten", async () => {
  const predecessor = suspendedPredecessor();
  const pending = createQaReplacementCampaignState(
    replacementSpec(),
    predecessor,
  );
  assertQaCampaignState(pending);
  assert.equal(pending.lineage.kind, "replacement");
  assert.equal(pending.lineage.seriesLimit, 10);
  assert.equal(pending.lineage.consumedBefore, 4);
  assert.equal(
    pending.lineage.predecessorCampaignId,
    predecessor.campaign.campaignId,
  );
  assert.equal(
    pending.lineage.predecessorStateSha256,
    qaCampaignStateSha256(predecessor),
  );
  assert.equal(pending.budget.limit, 6);
  assert.equal(pending.budget.issuedCount, 0);
  assert.notEqual(
    pending.campaign.campaignScopeSha256,
    predecessor.campaign.campaignScopeSha256,
  );

  const schema = JSON.parse(
    await readFile(
      "docs/browser-acceptance/schemas/qa-manager-campaign-state.schema.json",
      "utf8",
    ),
  );
  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(pending), true, JSON.stringify(validate.errors));

  const sixRunPhrase = campaignAuthorizationPhrase(
    pending.campaign.campaignId,
    pending.campaign.campaignScopeSha256,
    6,
  );
  assert.match(sixRunPhrase, / FOR 6 RUNS$/);
  assert.throws(
    () => authorizeQaCampaign(pending, {
      phrase: campaignAuthorizationPhrase(
        pending.campaign.campaignId,
        pending.campaign.campaignScopeSha256,
      ),
      at: "2026-07-30T00:12:00.000Z",
    }),
    /phrase mismatch/,
  );
  let state = authorizeQaCampaign(pending, {
    phrase: sixRunPhrase,
    at: "2026-07-30T00:12:00.000Z",
  });
  const ordinals = [];
  for (let local = 1; local <= 6; local += 1) {
    const ordinal = local + 4;
    const request = {
      ...childRequest(state, ordinal),
      issuedAt: `2026-07-30T01:${String(local * 2).padStart(2, "0")}:00.000Z`,
    };
    const issuance = issueQaCampaignChildGrant(state, request);
    ordinals.push(issuance.grant.ordinal);
    state = recordQaCampaignChildTerminal(issuance.state, {
      ...terminalEvidence(issuance.grant),
      terminalAt: `2026-07-30T01:${String((local * 2) + 1).padStart(2, "0")}:00.000Z`,
    });
  }
  assert.deepEqual(ordinals, [5, 6, 7, 8, 9, 10]);
  assert.equal(state.budget.issuedCount, 6);
  assert.equal(state.campaign.status, "completed");
  assert.throws(
    () => issueQaCampaignChildGrant(state, {
      ...childRequest(state, 11),
      issuedAt: "2026-07-30T01:14:00.000Z",
    }),
    /not active/,
  );
});

test("replacement creation rejects forged, unsafe, exhausted, and chained predecessors", () => {
  const specValue = replacementSpec("campaign_replacement_rejections");
  const active = activeState("campaign_active_predecessor");
  assert.throws(
    () => createQaReplacementCampaignState(specValue, active),
    /must be suspended/,
  );
  const activeIssued = issueQaCampaignChildGrant(
    activeState("campaign_active_child_predecessor"),
    childRequest(activeState("campaign_active_child_predecessor")),
  );
  const suspendedWithActiveChild = suspendQaCampaign(activeIssued.state, {
    reason: "user_pause",
    at: "2026-07-30T00:03:00.000Z",
  });
  assert.throws(
    () => createQaReplacementCampaignState(
      specValue,
      suspendedWithActiveChild,
    ),
    /active child/,
  );

  const zero = suspendQaCampaign(
    activeState("campaign_zero_predecessor"),
    { reason: "user_pause", at: "2026-07-30T00:02:00.000Z" },
  );
  assert.throws(
    () => createQaReplacementCampaignState(specValue, zero),
    /between one and nine/,
  );

  let full = activeState("campaign_full_predecessor");
  for (let ordinal = 1; ordinal <= 10; ordinal += 1) {
    const issuance = issueQaCampaignChildGrant(
      full,
      childRequest(full, ordinal),
    );
    full = recordQaCampaignChildTerminal(
      issuance.state,
      terminalEvidence(issuance.grant),
    );
  }
  assert.throws(
    () => createQaReplacementCampaignState(specValue, full),
    /must be suspended|between one and nine/,
  );

  const predecessor = suspendedPredecessor("campaign_chain_source");
  assert.throws(
    () => createQaReplacementCampaignState(
      { ...specValue, consumedBefore: 4 },
      predecessor,
    ),
    /spec fields mismatch/,
  );
  assert.throws(
    () => createQaReplacementCampaignState(
      { ...specValue, createdAt: "2026-07-30T00:09:00.000Z" },
      predecessor,
    ),
    /predates predecessor suspension/,
  );
  const replacement = createQaReplacementCampaignState(
    replacementSpec("campaign_chain_replacement"),
    predecessor,
  );
  const forgedSuspendedReplacement = structuredClone(replacement);
  forgedSuspendedReplacement.authorization.approved = true;
  forgedSuspendedReplacement.authorization.approvedAt =
    "2026-07-30T00:12:00.000Z";
  forgedSuspendedReplacement.campaign.status = "suspended";
  forgedSuspendedReplacement.campaign.activatedAt =
    "2026-07-30T00:12:00.000Z";
  forgedSuspendedReplacement.campaign.suspendedAt =
    "2026-07-30T00:13:00.000Z";
  forgedSuspendedReplacement.campaign.suspensionReason = "user_pause";
  assertQaCampaignState(forgedSuspendedReplacement);
  assert.throws(
    () => createQaReplacementCampaignState(
      replacementSpec("campaign_chain_second"),
      forgedSuspendedReplacement,
    ),
    /cannot use a replacement predecessor/,
  );

  const forgedLineage = structuredClone(replacement);
  forgedLineage.lineage.consumedBefore = 3;
  assert.throws(
    () => assertQaCampaignState(forgedLineage),
    /child limit mismatch|scope hash mismatch/,
  );
  const forgedLimit = structuredClone(replacement);
  forgedLimit.budget.limit = 7;
  assert.throws(
    () => assertQaCampaignState(forgedLimit),
    /authorization phrase hash mismatch|child limit mismatch/,
  );
  const forgedPhrase = structuredClone(replacement);
  forgedPhrase.authorization.exactPhraseSha256 = "f".repeat(64);
  assert.throws(
    () => assertQaCampaignState(forgedPhrase),
    /authorization phrase hash mismatch/,
  );
});

test("create-replacement CLI derives the six-run budget from predecessor state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-campaign-replacement-"));
  const predecessorPath = join(directory, "predecessor.json");
  const specPath = join(directory, "replacement-spec.json");
  const statePath = join(directory, "replacement-state.json");
  await writeJson(predecessorPath, suspendedPredecessor("campaign_cli_source"));
  await writeJson(specPath, replacementSpec("campaign_cli_replacement"));
  const result = await cli([
    "create-replacement",
    "--state", statePath,
    "--spec", specPath,
    "--predecessor-state", predecessorPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.runLimit, 6);
  assert.equal(output.consumedBefore, 4);
  assert.equal(output.seriesLimit, 10);
  assert.equal(output.predecessorCampaignId, "campaign_cli_source");
  assert.match(output.predecessorStateSha256, /^[a-f0-9]{64}$/);
  const saved = JSON.parse(await readFile(statePath, "utf8"));
  assertQaCampaignState(saved);
  assert.equal(saved.budget.limit, 6);
  assert.equal(saved.lineage.consumedBefore, 4);
});

test("receipt template is ordinary-flow compatible and terminal string privacy is recursive", async () => {
  const template = JSON.parse(
    await readFile("docs/browser-acceptance/templates/qa-receipt.v1.json", "utf8"),
  );
  assert.equal(template.automation.answerSource, "qa_scenario");
  assert.doesNotThrow(() => assertSanitizedTerminalReceiptStrings(template));
  for (const [path, value] of [
    ["promptContract/firstQuestion", "john.smith@example.net"],
    ["promptContract/secondQuestion", "https://private.example/path"],
    ["catalog/topLevelSkills/0", "profile_123"],
    ["findings/0", "profileId=private-value"],
    ["findings/0", "ACCOUNT-id: private-value"],
    ["findings/0", "USERNAME=private-value"],
    ["findings/0", "user.name private-value"],
    ["findings/0", "Profile.Id#private-value"],
    ["findings/0", "profile:id private-value"],
    ["findings/0", "PROFILE/ID private-value"],
    ["findings/0", "user:name private-value"],
    ["findings/0", "HANDLE:private-value"],
    ["disposition/summary", "password: hunter2"],
    ["runIsolation/runs/0", "direct message content"],
  ]) {
    assert.throws(
      () => assertSanitizedTerminalReceiptStrings(value, path),
      /private or unbounded receipt content/,
      path,
    );
  }
});

test("authorization, suspension, resume, revocation, and expiry require exact monotonic transitions", () => {
  const pending = createQaCampaignState(spec());
  assert.throws(
    () =>
      authorizeQaCampaign(pending, {
        phrase: "APPROVE QA BROWSER CAMPAIGN",
        at: "2026-07-30T00:01:00.000Z",
      }),
    /phrase mismatch/,
  );
  const active = activeState();
  const suspended = suspendQaCampaign(active, {
    reason: "user_pause",
    at: "2026-07-30T00:02:00.000Z",
  });
  assert.throws(
    () =>
      resumeQaCampaign(suspended, {
        phrase: "RESUME",
        at: "2026-07-30T00:03:00.000Z",
      }),
    /phrase mismatch/,
  );
  const resumed = resumeQaCampaign(suspended, {
    phrase: campaignResumePhrase(
      suspended.campaign.campaignId,
      suspended.campaign.campaignScopeSha256,
    ),
    at: "2026-07-30T00:03:00.000Z",
  });
  const revoked = revokeQaCampaign(resumed, {
    phrase: campaignRevocationPhrase(resumed.campaign.campaignId),
    at: "2026-07-30T00:04:00.000Z",
  });
  assert.equal(revoked.campaign.status, "revoked");
  assert.throws(
    () =>
      authorizeQaCampaign(revoked, {
        phrase: campaignAuthorizationPhrase(
          revoked.campaign.campaignId,
          revoked.campaign.campaignScopeSha256,
        ),
        at: "2026-07-30T00:05:00.000Z",
      }),
    /not pending/,
  );
  const expiredState = activeState("campaign_expiry");
  expiredState.campaign.createdAt = "2020-01-01T00:00:00.000Z";
  expiredState.authorization.approvedAt = "2020-01-01T00:01:00.000Z";
  expiredState.campaign.activatedAt = "2020-01-01T00:01:00.000Z";
  expiredState.campaign.expiresAt = "2020-01-02T00:00:00.000Z";
  assertQaCampaignState(expiredState);
  const expired = expireQaCampaign(expiredState, {
    at: "2020-01-02T00:00:00.000Z",
  });
  assert.equal(expired.campaign.status, "expired");
});

test("suspension and revocation cannot predate a completed child or prior transition", () => {
  const issued = issueQaCampaignChildGrant(activeState(), childRequest(activeState()));
  const terminal = recordQaCampaignChildTerminal(
    issued.state,
    terminalEvidence(issued.grant),
  );
  assert.throws(
    () => suspendQaCampaign(terminal, {
      reason: "user_pause",
      at: "2026-07-30T00:02:30.000Z",
    }),
    /predates lifecycle predecessor/,
  );
  const suspended = suspendQaCampaign(terminal, {
    reason: "user_pause",
    at: "2026-07-30T00:03:00.000Z",
  });
  const resumed = resumeQaCampaign(suspended, {
    phrase: campaignResumePhrase(
      suspended.campaign.campaignId,
      suspended.campaign.campaignScopeSha256,
    ),
    at: "2026-07-30T00:04:00.000Z",
  });
  assert.throws(
    () => revokeQaCampaign(resumed, {
      phrase: campaignRevocationPhrase(resumed.campaign.campaignId),
      at: "2026-07-30T00:03:30.000Z",
    }),
    /predates lifecycle predecessor/,
  );
  const revoked = revokeQaCampaign(resumed, {
    phrase: campaignRevocationPhrase(resumed.campaign.campaignId),
    at: "2026-07-30T00:04:00.000Z",
  });
  assert.equal(revoked.campaign.status, "revoked");
  const forged = structuredClone(revoked);
  forged.campaign.revokedAt = "2026-07-30T00:02:30.000Z";
  assert.throws(
    () => assertQaCampaignState(forged),
    /revocation predates prior lifecycle transition/,
  );
});

test("campaign state rejects every contradictory authorization, timestamp, and active-child combination", () => {
  const pending = createQaCampaignState(spec());
  const active = activeState();
  for (const forged of [
    { ...active, authorization: { ...active.authorization, approvedAt: null } },
    { ...active, campaign: { ...active.campaign, activatedAt: null } },
    { ...active, campaign: { ...active.campaign, status: "pending" } },
    { ...active, campaign: { ...active.campaign, status: "suspended", suspendedAt: null, suspensionReason: null } },
    { ...pending, campaign: { ...pending.campaign, status: "active" } },
  ]) assert.throws(() => assertQaCampaignState(forged), /inconsistent|lacks/);
  const issued = issueQaCampaignChildGrant(active, childRequest(active));
  assert.throws(
    () => assertQaCampaignState({ ...issued.state, campaign: { ...issued.state.campaign, status: "completed", completedAt: "2026-07-30T00:03:00.000Z" } }),
    /completed campaign did not consume|inconsistent/,
  );
});

test("loaded campaign state rechecks its seven-day bound and authorization machinery binding", () => {
  const state = activeState("campaign_persisted_invariants");
  assert.throws(
    () => assertQaCampaignState({
      ...state,
      campaign: { ...state.campaign, expiresAt: "2026-08-06T00:00:00.001Z" },
    }),
    /seven days/,
  );
  const changedPins = {
    ...state.pins.current,
    campaignReducerSha256: "f".repeat(64),
  };
  assert.throws(
    () => assertQaCampaignState({
      ...state,
      pins: {
        ...state.pins,
        current: changedPins,
        currentSha256: campaignPinsSha256(changedPins),
      },
    }),
    /authorization machinery binding/,
  );
});

test("revocation and expiry allow only an already-issued child to reconcile terminally", () => {
  const campaign = activeState("campaign_terminal_after_revocation");
  const issued = issueQaCampaignChildGrant(campaign, childRequest(campaign));
  const revoked = revokeQaCampaign(issued.state, {
    phrase: campaignRevocationPhrase(campaign.campaign.campaignId),
    at: "2026-07-30T00:02:00.000Z",
  });
  const revokedTerminal = recordQaCampaignChildTerminal(
    revoked,
    terminalEvidence(issued.grant),
  );
  assert.equal(revokedTerminal.campaign.status, "revoked");
  assert.equal(revokedTerminal.budget.activeChild, null);
  assert.throws(
    () => issueQaCampaignChildGrant(revokedTerminal, childRequest(revokedTerminal, 2)),
    /not active/,
  );

  const expiring = activeState("campaign_terminal_after_expiry");
  const expiringIssued = issueQaCampaignChildGrant(expiring, childRequest(expiring));
  const expiryBound = structuredClone(expiringIssued.state);
  expiryBound.campaign.expiresAt = "2026-07-30T00:02:30.000Z";
  assertQaCampaignState(expiryBound);
  const expired = expireQaCampaign(expiryBound, {
    at: "2026-07-30T00:02:30.000Z",
  });
  const expiredTerminal = recordQaCampaignChildTerminal(
    expired,
    terminalEvidence(expiringIssued.grant),
  );
  assert.equal(expiredTerminal.campaign.status, "expired");
  assert.equal(expiredTerminal.budget.activeChild, null);
  assert.throws(
    () => issueQaCampaignChildGrant(expiredTerminal, childRequest(expiredTerminal, 2)),
    /issuedAt is at or after campaign expiry/,
  );
});

test("ten grants are irrevocable, sequential, terminal-consumed, and an eleventh fails closed", () => {
  let state = activeState();
  const grants = [];
  for (let ordinal = 1; ordinal <= 10; ordinal += 1) {
    const issuance = issueQaCampaignChildGrant(
      state,
      childRequest(state, ordinal),
    );
    grants.push(issuance.grant);
    state = issuance.state;
    assert.equal(state.budget.issuedCount, ordinal);
    assert.throws(
      () =>
        issueQaCampaignChildGrant(
          state,
          childRequest(state, ordinal + 1),
        ),
      ordinal === 10
        ? /campaign child limit exhausted/
        : /campaign already has an active child/,
    );
    assert.throws(
      () =>
        recordQaCampaignChildTerminal(state, {
          ...terminalEvidence(issuance.grant),
          authorizationConsumed: false,
        }),
      /not consumed/,
    );
    state = recordQaCampaignChildTerminal(
      state,
      terminalEvidence(issuance.grant),
    );
  }
  assert.equal(new Set(grants.map((grant) => grant.grantSha256)).size, 10);
  assert.equal(state.budget.issuedCount, 10);
  assert.equal(state.campaign.status, "completed");
  assert.throws(
    () => issueQaCampaignChildGrant(state, childRequest(state, 11)),
    /campaign is not active/,
  );
});

test("duplicate run, duplicate path, stale pin, changed scope, and unconsumed predecessor fail closed", () => {
  const state = activeState();
  const request = childRequest(state);
  const issued = issueQaCampaignChildGrant(state, request);
  assert.throws(
    () => issueQaCampaignChildGrant(issued.state, request),
    /active child/,
  );
  const terminal = recordQaCampaignChildTerminal(
    issued.state,
    terminalEvidence(issued.grant),
  );
  assert.throws(
    () =>
      issueQaCampaignChildGrant(terminal, {
        ...childRequest(terminal, 2),
        runId: request.runId,
      }),
    /duplicate.*runId/,
  );
  assert.throws(
    () =>
      issueQaCampaignChildGrant(terminal, {
        ...childRequest(terminal, 2),
        runStatePathSha256: request.runStatePathSha256,
      }),
    /duplicate.*path/,
  );
  assert.throws(
    () =>
      issueQaCampaignChildGrant(terminal, {
        ...childRequest(terminal, 2),
        expectedPinsSha256: "f".repeat(64),
      }),
    /stale campaign pin/,
  );
  assert.throws(
    () =>
      issueQaCampaignChildGrant(terminal, {
        ...childRequest(terminal, 2),
        channels: ["facebook", "instagram", "linkedin"],
      }),
    /changed immutable scope/,
  );
});

test("campaign grant exactly binds child run creation without weakening one-time authorization", () => {
  const campaign = activeState();
  const { grant } = issueQaCampaignChildGrant(
    campaign,
    childRequest(campaign),
  );
  const run = createQaManagerRunState({
    runId: grant.runId,
    scenarioId: grant.scenarioId,
    scenarioSha256: grant.scenarioSha256,
    oracleId: grant.oracleId,
    oracleSha256: grant.oracleSha256,
    protocolVersion: grant.protocolVersion,
    protocolSha256: grant.protocolSha256,
    browser: grant.browser,
    channels: grant.channels,
    authorizationId: grant.authorizationId,
    campaignGrant: grant,
  });
  assertQaManagerRunState(run);
  assert.equal(run.campaign.grantSha256, grant.grantSha256);
  assert.equal(run.authorization.oneTime, true);
  assert.equal(run.authorization.consumed, false);
  assert.throws(
    () =>
      createQaManagerRunState({
        runId: "different_run",
        scenarioId: grant.scenarioId,
        scenarioSha256: grant.scenarioSha256,
        oracleId: grant.oracleId,
        oracleSha256: grant.oracleSha256,
        protocolVersion: grant.protocolVersion,
        protocolSha256: grant.protocolSha256,
        browser: grant.browser,
        channels: grant.channels,
        campaignGrant: grant,
      }),
    /does not exactly bind/,
  );
});

test("detached grants reject missing, extra, duplicate, self-rehashed, and active-child substitutions", () => {
  const campaign = activeState("campaign_exact_grant");
  const { state, grant } = issueQaCampaignChildGrant(campaign, childRequest(campaign));
  assertQaCampaignChildGrant(grant);
  assertQaCampaignActiveChildGrant(state, grant);
  const { issuedAt, ...missing } = grant;
  assert.throws(() => assertQaCampaignChildGrant(missing), /fields mismatch/);
  assert.throws(() => assertQaCampaignChildGrant({ ...grant, privateBrowserOutput: "no" }), /fields mismatch/);
  const selfRehashed = { ...grant, runId: "substituted_run" };
  selfRehashed.authorizationId = "substituted_run:one-time-browser-access";
  selfRehashed.grantSha256 = campaignChildGrantSha256(selfRehashed);
  assertQaCampaignChildGrant(selfRehashed);
  assert.throws(() => assertQaCampaignActiveChildGrant(state, selfRehashed), /active child/);
  const changedPath = { ...grant, runStatePathSha256: "f".repeat(64) };
  changedPath.grantSha256 = campaignChildGrantSha256(changedPath);
  assert.throws(() => assertQaCampaignActiveChildGrant(state, changedPath), /active child/);
});

test("strict JSON parsing rejects escape-decoded duplicate members at every nesting level", () => {
  assert.throws(
    () => parseQaStrictJson('{"runId":"one","run\\u0049d":"two"}', "grant"),
    /duplicate fields/,
  );
  assert.throws(
    () => parseQaStrictJson('{"outer":{"x":1,"\\u0078":2}}', "receipt"),
    /duplicate fields/,
  );
});

test("pin advancement is between children, append-only, verified, and cannot change authorization machinery", () => {
  let state = activeState();
  const issued = issueQaCampaignChildGrant(state, childRequest(state));
  assert.throws(
    () =>
      advanceQaCampaignPins(issued.state, {
        at: "2026-07-30T02:00:00.000Z",
        expectedPinsSha256: issued.state.pins.currentSha256,
        judgeApproved: true,
        qaRepinVerified: true,
        hashesVerified: true,
        offlineVerified: true,
        releaseVerified: true,
        pins: pins("e"),
      }),
    /active child/,
  );
  state = recordQaCampaignChildTerminal(
    issued.state,
    terminalEvidence(issued.grant),
  );
  const nextPins = pins("e");
  const advanced = advanceQaCampaignPins(state, {
    at: "2026-07-30T02:00:00.000Z",
    expectedPinsSha256: state.pins.currentSha256,
    judgeApproved: true,
    qaRepinVerified: true,
    hashesVerified: true,
    offlineVerified: true,
    releaseVerified: true,
    pins: nextPins,
  });
  assert.equal(advanced.pins.history.length, 1);
  assert.equal(advanced.pins.currentSha256, campaignPinsSha256(nextPins));
  assert.throws(
    () =>
      advanceQaCampaignPins(advanced, {
        at: "2026-07-30T02:01:00.000Z",
        expectedPinsSha256: advanced.pins.currentSha256,
        judgeApproved: true,
        qaRepinVerified: true,
        hashesVerified: true,
        offlineVerified: true,
        releaseVerified: true,
        pins: { ...nextPins, campaignReducerSha256: "9".repeat(64) },
      }),
    /authorization machinery/,
  );
});

test("operation-time expiry rejects caller-backdated authorization, issuance, resume, and pin advance", () => {
  const expiredPending = createQaCampaignState({
    ...spec("campaign_backdated_authorize"),
    createdAt: "2020-01-01T00:00:00.000Z",
    expiresAt: "2020-01-02T00:00:00.000Z",
  });
  assert.throws(
    () => authorizeQaCampaign(expiredPending, {
      phrase: campaignAuthorizationPhrase(expiredPending.campaign.campaignId, expiredPending.campaign.campaignScopeSha256),
      at: "2020-01-01T00:01:00.000Z",
    }),
    /expiry|expired/,
  );
  const expired = activeState("campaign_backdated_operations");
  expired.campaign.createdAt = "2020-01-01T00:00:00.000Z";
  expired.authorization.approvedAt = "2020-01-01T00:01:00.000Z";
  expired.campaign.activatedAt = "2020-01-01T00:01:00.000Z";
  expired.campaign.expiresAt = "2020-01-02T00:00:00.000Z";
  assertQaCampaignState(expired);
  assert.throws(() => issueQaCampaignChildGrant(expired, childRequest(expired)), /expiry|expired/);
  const suspended = suspendQaCampaign(expired, {
    reason: "user_pause", at: "2020-01-01T00:02:00.000Z",
  });
  assert.throws(
    () => resumeQaCampaign(suspended, {
      phrase: campaignResumePhrase(suspended.campaign.campaignId, suspended.campaign.campaignScopeSha256),
      at: "2020-01-01T00:03:00.000Z",
    }),
    /expiry|expired/,
  );
  assert.throws(
    () => advanceQaCampaignPins(expired, {
      at: "2020-01-01T00:02:00.000Z",
      expectedPinsSha256: expired.pins.currentSha256,
      judgeApproved: true, qaRepinVerified: true, hashesVerified: true,
      offlineVerified: true, releaseVerified: true, pins: pins("e"),
    }),
    /expired/,
  );
});

test("trusted chronology rejects future, backdated, and out-of-order lifecycle timestamps before mutation", () => {
  const pending = createQaCampaignState(spec("campaign_trusted_chronology"));
  const phrase = campaignAuthorizationPhrase(pending.campaign.campaignId, pending.campaign.campaignScopeSha256);
  const futureAt = new Date(Date.now() + 86_400_000).toISOString();
  assert.throws(
    () => authorizeQaCampaign(pending, { phrase, at: futureAt }),
    /future/,
  );
  const active = activeState("campaign_ordered_chronology");
  assert.throws(
    () => issueQaCampaignChildGrant(active, { ...childRequest(active), issuedAt: "2026-07-30T00:00:30.000Z" }),
    /predates lifecycle predecessor/,
  );
  const issued = issueQaCampaignChildGrant(active, childRequest(active));
  assert.throws(
    () => recordQaCampaignChildTerminal(issued.state, { ...terminalEvidence(issued.grant), terminalAt: "2026-07-30T00:01:00.000Z" }),
    /predates lifecycle predecessor/,
  );
  const terminal = recordQaCampaignChildTerminal(issued.state, terminalEvidence(issued.grant));
  assert.throws(
    () => issueQaCampaignChildGrant(terminal, { ...childRequest(terminal, 2), issuedAt: "2026-07-30T00:02:30.000Z" }),
    /predates lifecycle predecessor/,
  );
});

test("private state fields and malformed pin history are rejected before any mutation", () => {
  const state = activeState("campaign_schema_exact");
  assert.throws(
    () => assertQaCampaignState({ ...state, privateBrowserOutput: "forbidden" }),
    /fields mismatch/,
  );
  assert.throws(
    () => assertQaCampaignState({
      ...state,
      pins: { ...state.pins, history: [{ pinsSha256: "a".repeat(64), supersededAt: "2026-07-30T00:00:00.000Z", rawTargetId: "forbidden" }] },
    }),
    /fields mismatch/,
  );
});

test("repeated multi-process grant contention has one winner and no sanitized grant stdout from losers", async () => {
  for (let round = 0; round < 6; round += 1) {
    const directory = await mkdtemp(join(tmpdir(), "qa-campaign-race-"));
    const statePath = join(directory, "state.json");
    const current = activeState(`campaign_race_${round}`);
    await writeJson(statePath, current);
    const requestPaths = [];
    for (let contender = 0; contender < 8; contender += 1) {
      const request = childRequest(current, contender + 1);
      const requestPath = join(directory, `request-${contender}.json`);
      await writeJson(requestPath, request);
      requestPaths.push(requestPath);
    }
    const results = await Promise.all(
      requestPaths.map((requestPath) =>
        cli([
          "issue-child-grant",
          "--state",
          statePath,
          "--request",
          requestPath,
        ]),
      ),
    );
    const winners = results.filter((result) => result.status === 0);
    assert.equal(winners.length, 1);
    for (const loser of results.filter((result) => result.status !== 0)) {
      assert.equal(loser.stdout, "");
    }
    const saved = JSON.parse(await readFile(statePath, "utf8"));
    assertQaCampaignState(saved);
    assert.equal(saved.budget.issuedCount, 1);
    assert.equal(saved.budget.children.filter((child) => child.status === "active").length, 1);
  }
});

test("crash after durable issuance never replays or refunds a grant; stale recovery suspends authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-campaign-crash-"));
  const statePath = join(directory, "state.json");
  const requestPath = join(directory, "request.json");
  const current = activeState("campaign_crash");
  await writeJson(statePath, current);
  await writeJson(requestPath, childRequest(current));
  const crashed = await cli(
    [
      "issue-child-grant",
      "--state",
      statePath,
      "--request",
      requestPath,
    ],
    { env: { QA_CAMPAIGN_TEST_CRASH_AFTER_PERSIST: "1" } },
  );
  assert.equal(crashed.status, 86);
  assert.equal(crashed.stdout, "");
  const committed = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(committed.budget.issuedCount, 1);
  assert.ok(committed.budget.activeChild);
  const claim = JSON.parse(
    await readFile(qaCampaignClaimPath(statePath), "utf8"),
  );
  const recovered = await cli([
    "recover-stale-claim",
    "--state",
    statePath,
    "--nonce",
    claim.nonce,
    "--at",
    "2026-07-30T03:00:00.000Z",
  ]);
  assert.equal(recovered.status, 0, recovered.stderr);
  const suspended = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(suspended.campaign.status, "suspended");
  assert.equal(suspended.budget.issuedCount, 1);
  const replay = await cli([
    "issue-child-grant",
    "--state",
    statePath,
    "--request",
    requestPath,
  ]);
  assert.notEqual(replay.status, 0);
  assert.equal(replay.stdout, "");
  const unchanged = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(unchanged.budget.issuedCount, 1);
  assert.equal(unchanged.budget.children[0].grantSha256, committed.budget.children[0].grantSha256);
});

test("multi-process issuance versus suspend, revoke, expiry, and pin advancement preserves monotonic state", async () => {
  const controls = ["suspend", "revoke", "expire", "advance-pin"];
  for (const [index, control] of controls.entries()) {
    const directory = await mkdtemp(join(tmpdir(), `qa-campaign-${control}-`));
    const statePath = join(directory, "state.json");
    const requestPath = join(directory, "request.json");
    const campaign = activeState(`campaign_control_${index}`);
    await writeJson(statePath, campaign);
    await writeJson(requestPath, childRequest(campaign));
    let controlArgs;
    if (control === "suspend") {
      controlArgs = [
        "suspend", "--state", statePath, "--reason", "user_pause", "--at",
        "2026-07-30T04:00:00.000Z",
      ];
    } else if (control === "revoke") {
      controlArgs = [
        "revoke", "--state", statePath, "--phrase",
        campaignRevocationPhrase(campaign.campaign.campaignId), "--at",
        "2026-07-30T04:00:00.000Z",
      ];
    } else if (control === "expire") {
      controlArgs = [
        "expire", "--state", statePath, "--at", campaign.campaign.expiresAt,
      ];
    } else {
      const nextPins = pins("e");
      const pinRequestPath = join(directory, "pin-request.json");
      await writeJson(pinRequestPath, {
        at: "2026-07-30T04:00:00.000Z",
        expectedPinsSha256: campaign.pins.currentSha256,
        judgeApproved: true,
        qaRepinVerified: true,
        hashesVerified: true,
        offlineVerified: true,
        releaseVerified: true,
        pins: nextPins,
      });
      controlArgs = ["advance-pin", "--state", statePath, "--request", pinRequestPath];
    }
    const [issuance, controlResult] = await Promise.all([
      cli(["issue-child-grant", "--state", statePath, "--request", requestPath]),
      cli(controlArgs),
    ]);
    const saved = JSON.parse(await readFile(statePath, "utf8"));
    assertQaCampaignState(saved);
    assert.ok(saved.budget.issuedCount <= 1);
    assert.ok(
      saved.budget.children.filter((child) => child.status === "active").length <= 1,
    );
    if (control === "revoke" && controlResult.status === 0) {
      assert.equal(saved.campaign.status, "revoked");
    }
    if (control === "expire" && controlResult.status === 0) {
      assert.equal(saved.campaign.status, "expired");
    }
    if (issuance.status !== 0) assert.equal(issuance.stdout, "");
    if (controlResult.status !== 0) assert.equal(controlResult.stdout, "");
  }
});

test("terminal reconciliation racing revocation loses neither committed terminal nor revocation state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-campaign-terminal-race-"));
  const statePath = join(directory, "state.json");
  const runStatePath = join(directory, "run-state.json");
  const receiptPath = join(directory, "receipt.json");
  const campaign = activeState("campaign_terminal_race");
  const issued = issueQaCampaignChildGrant(
    campaign, childRequest(campaign, 1, runStatePath),
  );
  await writeJson(statePath, issued.state);
  const runState = createQaManagerRunState({
    runId: issued.grant.runId,
    scenarioId: issued.grant.scenarioId,
    scenarioSha256: issued.grant.scenarioSha256,
    oracleId: issued.grant.oracleId,
    oracleSha256: issued.grant.oracleSha256,
    protocolVersion: issued.grant.protocolVersion,
    protocolSha256: issued.grant.protocolSha256,
    browser: issued.grant.browser,
    channels: issued.grant.channels,
    campaignGrant: issued.grant,
  });
  runState.authorization.browserAccessAuthorized = false;
  runState.authorization.consumed = true;
  runState.terminal = {
    resultId: "run_stopped",
    reason: "worker_host_unavailable",
    disposition: "blocked",
    blockingProductFinding: false,
    resumeSupported: false,
    emitted: false,
    checkpoint: null,
  };
  assertQaManagerRunState(runState);
  await writeJson(runStatePath, runState);
  const grantPath = join(directory, "grant.json");
  await writeJson(grantPath, issued.grant);
  const receipt = JSON.parse(
    await readFile("docs/browser-acceptance/templates/qa-receipt.v1.json", "utf8"),
  );
  receipt.runId = issued.grant.runId;
  receipt.capturedAt = "2026-07-30T05:00:00.000Z";
  receipt.automation = {
    ...receipt.automation,
    managerDriven: true,
    protocolVersion: issued.grant.protocolVersion,
    scenarioId: issued.grant.scenarioId,
    scenarioSha256: issued.grant.scenarioSha256,
    oracleId: issued.grant.oracleId,
    oracleSha256: issued.grant.oracleSha256,
    answerSource: "manager_campaign",
    campaign: {
      campaignId: issued.grant.campaignId,
      campaignScopeSha256: issued.grant.campaignScopeSha256,
      ordinal: issued.grant.ordinal,
      grantSha256: issued.grant.grantSha256,
      pinsSha256: issued.grant.pinsSha256,
    },
  };
  receipt.disposition.status = "blocked";
  receipt.source.commit = issued.state.pins.current.productCommit;
  receipt.channels = Object.fromEntries(issued.grant.channels.map((channel) => [channel, {}]));
  await writeJson(receiptPath, receipt);
  const substitutedRunStatePath = join(directory, "substituted-run-state.json");
  await writeJson(substitutedRunStatePath, runState);
  const substitutedPathTerminal = await cli([
    "record-child-terminal", "--state", statePath, "--run-state", substitutedRunStatePath,
    "--grant", grantPath,
    "--receipt", receiptPath, "--at", "2026-07-30T05:00:00.000Z",
  ]);
  assert.notEqual(substitutedPathTerminal.status, 0);
  assert.equal(substitutedPathTerminal.stdout, "");
  assert.match(
    substitutedPathTerminal.stderr,
    /actual run-state path does not exactly match campaign binding/,
  );
  const afterSubstitutedPath = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(afterSubstitutedPath.budget.activeChild?.status, "active");
  const mismatchedReceiptPath = join(directory, "mismatched-receipt.json");
  const mismatchedReceipt = structuredClone(receipt);
  mismatchedReceipt.automation.oracleSha256 = "f".repeat(64);
  await writeJson(mismatchedReceiptPath, mismatchedReceipt);
  const mismatchedTerminal = await cli([
    "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
    "--grant", grantPath,
    "--receipt", mismatchedReceiptPath, "--at", "2026-07-30T05:00:00.000Z",
  ]);
  assert.notEqual(mismatchedTerminal.status, 0);
  assert.equal(mismatchedTerminal.stdout, "");
  assert.match(mismatchedTerminal.stderr, /terminal receipt oracle hash mismatch/);
  const mismatchedBrowserPath = join(directory, "mismatched-browser-receipt.json");
  const mismatchedBrowser = structuredClone(receipt);
  mismatchedBrowser.browserSelection.browser = "in_app";
  await writeJson(mismatchedBrowserPath, mismatchedBrowser);
  const mismatchedBrowserTerminal = await cli([
    "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
    "--grant", grantPath,
    "--receipt", mismatchedBrowserPath, "--at", "2026-07-30T05:00:00.000Z",
  ]);
  assert.notEqual(mismatchedBrowserTerminal.status, 0);
  assert.equal(mismatchedBrowserTerminal.stdout, "");
  assert.match(mismatchedBrowserTerminal.stderr, /browser does not exactly match grant and run/);
  const mismatchedCommitPath = join(directory, "mismatched-commit-receipt.json");
  const mismatchedCommit = structuredClone(receipt);
  mismatchedCommit.source.commit = "0".repeat(40);
  await writeJson(mismatchedCommitPath, mismatchedCommit);
  const mismatchedCommitTerminal = await cli([
    "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
    "--grant", grantPath,
    "--receipt", mismatchedCommitPath, "--at", "2026-07-30T05:00:00.000Z",
  ]);
  assert.notEqual(mismatchedCommitTerminal.status, 0);
  assert.equal(mismatchedCommitTerminal.stdout, "");
  assert.match(mismatchedCommitTerminal.stderr, /source commit does not match current product pin/);
  for (const action of Object.keys(receipt.prohibitedActions)) {
    const prohibitedActionPath = join(directory, `prohibited-${action}.json`);
    const prohibitedActionReceipt = structuredClone(receipt);
    prohibitedActionReceipt.prohibitedActions[action] = true;
    await writeJson(prohibitedActionPath, prohibitedActionReceipt);
    const prohibitedActionTerminal = await cli([
      "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
      "--grant", grantPath,
      "--receipt", prohibitedActionPath, "--at", "2026-07-30T05:00:00.000Z",
    ]);
    assert.notEqual(prohibitedActionTerminal.status, 0, action);
    assert.equal(prohibitedActionTerminal.stdout, "", action);
    assert.match(
      prohibitedActionTerminal.stderr,
      new RegExp(`prohibited action ${action} must be false`),
      action,
    );
  }
  const privateFindingPath = join(directory, "private-finding-receipt.json");
  const privateFinding = structuredClone(receipt);
  privateFinding.findings = ["account_123"];
  await writeJson(privateFindingPath, privateFinding);
  const privateFindingTerminal = await cli([
    "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
    "--grant", grantPath,
    "--receipt", privateFindingPath, "--at", "2026-07-30T05:00:00.000Z",
  ]);
  assert.notEqual(privateFindingTerminal.status, 0);
  assert.equal(privateFindingTerminal.stdout, "");
  assert.match(privateFindingTerminal.stderr, /private or unbounded receipt content/);
  const privatePromptPath = join(directory, "private-prompt-receipt.json");
  const privatePrompt = structuredClone(receipt);
  privatePrompt.promptContract.firstQuestion = "john.smith@example.net";
  await writeJson(privatePromptPath, privatePrompt);
  const privatePromptTerminal = await cli([
    "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
    "--grant", grantPath,
    "--receipt", privatePromptPath, "--at", "2026-07-30T05:00:00.000Z",
  ]);
  assert.notEqual(privatePromptTerminal.status, 0);
  assert.equal(privatePromptTerminal.stdout, "");
  assert.match(privatePromptTerminal.stderr, /private or unbounded receipt content/);
  const receiptBooleanPaths = [
    "installation.installed", "source.worktreeClean",
    "qaRepository.privateArtifactsIgnored", "catalog.exactlyOneOrchestrator",
    "promptContract.guidedAndAutomaticOffered", "runIsolation.crossRunInheritanceObserved",
    "browserSelection.confirmedByUser",
  ];
  for (const field of receiptBooleanPaths) {
    const invalidReceipt = structuredClone(receipt);
    const invalidPath = join(directory, `invalid-${field.replaceAll(".", "-")}.json`);
    // Mutate the clone, never the valid receipt used by the terminal race.
    const invalidSet = (value) => {
      const [group, property] = field.split(".");
      invalidReceipt[group][property] = value;
    };
    invalidSet("false");
    await writeJson(invalidPath, invalidReceipt);
    const invalidTerminal = await cli([
      "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
      "--grant", grantPath, "--receipt", invalidPath, "--at", "2026-07-30T05:00:00.000Z",
    ]);
    assert.notEqual(invalidTerminal.status, 0, field);
    assert.equal(invalidTerminal.stdout, "", field);
    assert.match(invalidTerminal.stderr, new RegExp(`${field.replace(".", "\\.")} must be boolean`), field);
  }
  const backdatedReceiptPath = join(directory, "backdated-receipt.json");
  const backdatedReceipt = structuredClone(receipt);
  backdatedReceipt.capturedAt = "2026-07-30T00:01:00.000Z";
  await writeJson(backdatedReceiptPath, backdatedReceipt);
  const backdatedTerminal = await cli([
    "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
    "--grant", grantPath,
    "--receipt", backdatedReceiptPath, "--at", "2026-07-30T05:00:00.000Z",
  ]);
  assert.notEqual(backdatedTerminal.status, 0);
  assert.equal(backdatedTerminal.stdout, "");
  assert.match(backdatedTerminal.stderr, /capturedAt predates lifecycle predecessor/);
  const [terminal, revoked] = await Promise.all([
    cli([
      "record-child-terminal", "--state", statePath, "--run-state", runStatePath,
      "--grant", grantPath,
      "--receipt", receiptPath, "--at", "2026-07-30T05:00:00.000Z",
    ]),
    cli([
      "revoke", "--state", statePath, "--phrase",
      campaignRevocationPhrase(campaign.campaign.campaignId), "--at",
      "2026-07-30T05:00:00.000Z",
    ]),
  ]);
  assert.equal(terminal.status, 0, terminal.stderr);
  assert.equal(revoked.status, 0, revoked.stderr);
  const saved = JSON.parse(await readFile(statePath, "utf8"));
  assertQaCampaignState(saved);
  assert.equal(saved.campaign.status, "revoked");
  assert.equal(saved.budget.activeChild, null);
  assert.equal(saved.budget.children[0].status, "terminal");
  assert.equal(saved.budget.children[0].targetDisposition, "released");
});

test("crash before mutation changes no budget and stale recovery cannot restore broader authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-campaign-precrash-"));
  const statePath = join(directory, "state.json");
  const requestPath = join(directory, "request.json");
  const campaign = activeState("campaign_precrash");
  await writeJson(statePath, campaign);
  await writeJson(requestPath, childRequest(campaign));
  const crashed = await cli(
    ["issue-child-grant", "--state", statePath, "--request", requestPath],
    { env: { QA_CAMPAIGN_TEST_CRASH_AFTER_CLAIM: "1" } },
  );
  assert.equal(crashed.status, 85);
  assert.equal(crashed.stdout, "");
  const claim = JSON.parse(await readFile(qaCampaignClaimPath(statePath), "utf8"));
  const recovered = await cli([
    "recover-stale-claim", "--state", statePath, "--nonce", claim.nonce,
    "--at", "2026-07-30T06:00:00.000Z",
  ]);
  assert.equal(recovered.status, 0, recovered.stderr);
  const saved = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(saved.budget.issuedCount, 0);
  assert.equal(saved.campaign.status, "suspended");
  assert.equal(saved.authorization.approved, true);
  assert.throws(
    () => issueQaCampaignChildGrant(saved, childRequest(saved)),
    /not active/,
  );
});

test("stale-claim recovery rejects escaped duplicate state members before mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-campaign-duplicate-stale-"));
  const statePath = join(directory, "state.json");
  const state = activeState("campaign_duplicate_stale");
  const duplicateState = JSON.stringify(state).replace(
    '"revision":1',
    '"revision":1,"re\\u0076ision":1',
  );
  await writeFile(statePath, duplicateState, "utf8");
  const claimPath = qaCampaignClaimPath(statePath);
  const claim = {
    schemaVersion: "qa-campaign-mutation-claim/v1",
    nonce: "duplicate_stale_nonce",
    pid: 999_999_999,
    command: "suspend",
    createdAt: "2026-07-30T00:02:00.000Z",
  };
  await writeJson(claimPath, claim);

  const recovered = await cli([
    "recover-stale-claim", "--state", statePath, "--nonce", claim.nonce,
    "--at", "2026-07-30T06:00:00.000Z",
  ]);
  assert.notEqual(recovered.status, 0);
  assert.equal(recovered.stdout, "");
  assert.match(recovered.stderr, /duplicate fields/);
  assert.equal(await readFile(statePath, "utf8"), duplicateState);
  assert.deepEqual(JSON.parse(await readFile(claimPath, "utf8")), claim);
});
