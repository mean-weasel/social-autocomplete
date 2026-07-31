import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const managerStarterPath =
  "docs/browser-acceptance/prompts/qa-manager-starter.md";
const workerDispatchPath =
  "docs/browser-acceptance/prompts/qa-worker-dispatch.md";
const managerRunbookPath =
  "docs/browser-acceptance/runbooks/qa-manager.md";
const protocolPath =
  "docs/browser-acceptance/protocol/manager-worker.md";

function assertPostAcknowledgementAcquisitionContract(contract) {
  const normalized = contract
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const bindingPhrase = /exact selected host (?:browser )?binding again/i;
  const bindingMatch = bindingPhrase.exec(normalized);

  assert.match(
    normalized,
    /availability probe(?: only)?|only (?:as )?an availability probe/i,
  );
  assert.ok(bindingMatch, "requires exact selected-host binding re-resolution");

  const bindingIndex = bindingMatch.index;
  const acknowledgementScope = normalized.slice(
    Math.max(0, bindingIndex - 400),
    bindingIndex,
  );
  const continuationScope = normalized.slice(
    Math.max(0, bindingIndex - 200),
    bindingIndex + 1400,
  );
  const acquisitionScope = normalized.slice(bindingIndex, bindingIndex + 1400);
  const tabsNewIndex = acquisitionScope.search(/tabs\.new/i);

  assert.match(acknowledgementScope, /acknowledg|ACK\/hash/i);
  assert.match(normalized, /lease(?:-| )hash|targetLeaseHash/i);
  assert.match(
    continuationScope,
    /same (?:post-acknowledgement )?(?:worker )?continuation/i,
  );
  assert.match(
    acquisitionScope,
    /(?:emit |with )?no[^.]{0,220}(?:intermediate |other )worker output|without[^.]{0,220}(?:intermediate |other )worker output/i,
  );
  assert.match(
    acquisitionScope,
    /immediate(?:ly)?[^.]{0,80}tabs\.new|tabs\.new[^.]{0,80}immediate(?:ly)?/i,
  );
  assert.ok(tabsNewIndex > 0, "requires tabs.new after binding re-resolution");
  assert.match(acquisitionScope, /started/i);
  assert.match(acquisitionScope, /ambiguous_browser_action/i);
  assert.match(
    acquisitionScope,
    /non-replayable|never retr(?:y|ied)|cannot be retried|do not retry|without retry/i,
  );
}

test("saved manager starter is directly executable and self-resolving", async () => {
  const starter = await readFile(managerStarterPath, "utf8");

  assert.match(starter, /^QA manager starter contract: qa-manager-starter\/v1/);
  assert.doesNotMatch(starter, /\{\{[A-Z0-9_]+\}\}/);
  assert.match(starter, /current project root as the product repository/);
  assert.match(starter, /git rev-parse HEAD/);
  assert.match(starter, /\.social-metadata\/qa\/manager-config\.json/);
  assert.match(starter, /ask the user to\s+choose and confirm the absolute QA repository path/);
  assert.match(starter, /allow\s+the user to amend it/);
  assert.match(starter, /Recommend `configure_and_run`/);
});

test("manager starter preserves ownership and safety gates", async () => {
  const starter = await readFile(managerStarterPath, "utf8");

  assert.match(starter, /manager configuration is product-repository owned/i);
  assert.match(starter, /QA\s+repository is worker-only/);
  assert.match(starter, /explicitly approved/);
  assert.match(starter, /manager must not\s+operate the browser/);
  assert.match(starter, /Never request or handle credentials/);
  assert.match(starter, /genuinely fresh Codex worker task/);
});

test("manager starter accepts ordered channel subsets without oracle expansion", async () => {
  const starter = await readFile(managerStarterPath, "utf8");

  assert.match(starter, /any nonempty ordered subset available in the\s+confirmed browser/);
  assert.match(starter, /Never require an all-channel run/);
  assert.match(starter, /capability oracle/);
  assert.match(starter, /Preserve `scenario\.channels` exactly/);
  assert.match(starter, /never sort, inherit, expand, or add channels/);
  assert.doesNotMatch(starter, /scenario and oracle IDs match/i);
});

test("manager starter requires event-aware worker supervision", async () => {
  const starter = await readFile(managerStarterPath, "utf8");

  assert.match(starter, /list_projects/);
  assert.match(starter, /create_thread/);
  assert.match(starter, /wait_threads/);
  assert.match(starter, /send_message_to_thread/);
  assert.match(starter, /matching the configured\s+absolute QA repository path/);
  assert.match(starter, /Never guess, derive, or\s+persist an opaque project ID/);
  assert.match(starter, /approximately 60 seconds/);
  assert.match(starter, /timeout is only a manager heartbeat/);
  assert.match(starter, /do not send repeated status questions/);
  assert.match(starter, /Do not return a final answer while the worker is still active/);
});

test("manager starter makes recovery manager-owned, durable, and bounded", async () => {
  const starter = await readFile(managerStarterPath, "utf8");

  assert.match(starter, /qa-manager-run-state\.schema\.json/);
  assert.match(starter, /qa-recovery\.mjs/);
  assert.match(starter, /Only the manager may create tasks/);
  assert.match(starter, /at most one manager-owned recovery continuation/);
  assert.match(starter, /Persist its\s+deterministic lease before task creation/);
  assert.match(starter, /Never recover an action at `started`/);
  assert.match(starter, /consumes the run's one-time browser authorization/);
  assert.match(starter, /authorize_browser_action_start/);
  assert.match(starter, /QA_CHECKPOINT_ACK/);
  assert.match(starter, /timeoutMs:60000/);
  assert.match(starter, /targetLeaseHash/);
  assert.match(starter, /private active-task\s+identity/);
  assert.match(starter, /single-use `issued` state/);
  assert.match(starter, /qa-recovery\.mjs issue-ack/);
  assert.match(starter, /qa-recovery\.mjs issue-auth-recovery/);
  assert.match(starter, /QA_AUTHENTICATION_RECOVERY_LEASE/);
  assert.match(starter, /APPROVE QA BROWSER CAMPAIGN/);
  assert.match(starter, /at most one active child/i);
});

test("worker dispatch prompt has an exact versioned placeholder contract", async () => {
  const dispatch = await readFile(workerDispatchPath, "utf8");
  const placeholders = [
    ...dispatch.matchAll(/\{\{([A-Z0-9_]+)\}\}/g),
  ].map((match) => match[1]);

  assert.match(
    dispatch,
    /^QA worker dispatch prompt contract: qa-worker-dispatch\/v1/,
  );
  assert.deepEqual(placeholders, [
    "PRODUCT_REPOSITORY",
    "PRODUCT_COMMIT",
    "QA_REPOSITORY",
    "QA_SCOPE",
    "SCENARIO_PATH",
    "SCENARIO_SHA256",
    "ORACLE_PATH",
    "ORACLE_SHA256",
    "PROTOCOL_PATH",
    "PROTOCOL_SHA256",
  ]);
  assert.match(dispatch, /Stop as `worker_dispatch_invalid` if a placeholder remains/);
  assert.match(dispatch, /Never launch temporary or profile-less Chromium/);
  assert.match(dispatch, /Never publish, enter a\s+composer, scrape/);
  assert.doesNotMatch(dispatch, /wait_threads|afterCursor|approximately 60 seconds/);
  assert.match(dispatch, /may never create, fork, or\s+authorize another task/);
  assert.match(dispatch, /worker_handoff/);
  assert.match(dispatch, /verify_browser_binding/);
  assert.match(dispatch, /browser_binding_verified/);
  assert.match(dispatch, /Never assume a\s+binding object survives a Codex turn/);
  assert.match(dispatch, /browser_binding_unavailable/);
  assert.match(dispatch, /browser_action_started/);
  assert.match(dispatch, /actionHash/);
  assert.match(dispatch, /timeoutMs:60000/);
  assert.match(dispatch, /QA_CHECKPOINT_ACK/);
  assert.match(dispatch, /Do not call the browser until/);
  assert.match(dispatch, /manager-supplied `targetLeaseHash`/);
  assert.match(dispatch, /Never invent or recompute a\s+lease hash/);
  assert.match(dispatch, /QA_AUTHENTICATION_RECOVERY_LEASE/);
  assert.match(dispatch, /reject missing, extra, malformed, or mismatched fields/);
  assert.match(dispatch, /Never resend an accepted response/);
  assert.doesNotMatch(dispatch, /campaign child grant/i);
  assert.doesNotMatch(dispatch, /Instagram → Facebook → LinkedIn/);
});

test("documentation exposes starter, manager, worker dispatch, and worker runbook", async () => {
  const [readme, managerRunbook, workerRunbook] = await Promise.all([
    readFile("docs/browser-acceptance/README.md", "utf8"),
    readFile("docs/browser-acceptance/runbooks/qa-manager.md", "utf8"),
    readFile("docs/browser-acceptance/runbooks/qa-worker.md", "utf8"),
  ]);

  assert.match(
    readme,
    /Follow docs\/browser-acceptance\/prompts\/qa-manager-starter\.md\./,
  );
  assert.match(readme, /prompts\/qa-worker-dispatch\.md/);
  assert.match(readme, /runbooks\/qa-worker\.md/);
  assert.match(readme, /oracles\/chrome-authenticated-research\.yaml/);
  assert.match(readme, /oracles\/in-app-public-research\.yaml/);
  assert.match(managerRunbook, /prompts\/qa-worker-dispatch\.md/);
  assert.match(managerRunbook, /scenario\.channels` remains the sole authority/);
  assert.match(managerRunbook, /Never generate an oracle from questionnaire answers/);
  assert.match(workerRunbook, /complete and\s+exclusive run plan/);
  assert.match(workerRunbook, /Never sort the scenario list into oracle order/);
});

test("manager runbook defines cursor and timeout behavior without status polling", async () => {
  const [runbook, protocol] = await Promise.all([
    readFile(managerRunbookPath, "utf8"),
    readFile(protocolPath, "utf8"),
  ]);

  assert.match(runbook, /list_projects/);
  assert.match(runbook, /require exactly one matching project/);
  assert.match(runbook, /current `afterCursor`/);
  assert.match(runbook, /approximately 60 seconds/);
  assert.match(runbook, /never send repeated “status\?” messages/);
  assert.match(runbook, /authorize_browser_action_start/);
  assert.match(runbook, /QA_CHECKPOINT_ACK/);
  assert.match(runbook, /canonical target lease hash/);
  assert.match(runbook, /exact-copy and compare that hash/);
  assert.match(runbook, /Persist the single-use acknowledgement\s+issuance state/);
  assert.match(runbook, /qa-recovery\.mjs issue-ack/);
  assert.match(runbook, /qa-recovery\.mjs issue-auth-recovery/);
  assert.match(runbook, /before writing only the sanitized\s+envelope to stdout/);
  assert.match(runbook, /same state-path-scoped\s+exclusive mutation boundary/);
  assert.match(runbook, /no stale read may erase a\s+terminal transition or restore consumed authorization/);
  assert.match(runbook, /all losers return empty stdout/);
  assert.match(runbook, /non-replayable/);
  assert.match(runbook, /QA_AUTHENTICATION_RECOVERY_LEASE/);
  assert.match(runbook, /never resend the\s+acknowledgement/);
  assert.match(runbook, /do not return a final answer while the worker remains active/);
  assert.match(runbook, /Do not substitute shell\s+polling, a recurring automation, or an operating-system timer/);

  assert.match(protocol, /## Transport and liveness/);
  assert.match(protocol, /wait timeout is a local manager\s+heartbeat only/);
  assert.match(protocol, /must never be converted into `run_complete` or `run_stopped`/);
  assert.match(protocol, /waits again without sending a status ping/);
  assert.match(protocol, /issue-ack --state <run-state>/);
  assert.match(protocol, /issue-auth-recovery --state <run-state>/);
  assert.match(protocol, /fails closed without output/);
  assert.match(protocol, /exclusive\s+opaque saved-state mutation boundary/);
  assert.match(protocol, /No stale read can overwrite\s+a committed terminal\/recovery transition or restore consumed authorization/);
  assert.match(protocol, /never expired, stolen, deleted by a\s+loser/);
});

test("protocol and runbooks define fail-closed single-owner host recovery", async () => {
  const [starter, dispatch, manager, worker, protocol] = await Promise.all([
    readFile(managerStarterPath, "utf8"),
    readFile(workerDispatchPath, "utf8"),
    readFile(managerRunbookPath, "utf8"),
    readFile("docs/browser-acceptance/runbooks/qa-worker.md", "utf8"),
    readFile(protocolPath, "utf8"),
  ]);

  assert.match(manager, /exact retry limit is one/);
  assert.match(manager, /Only the manager may recover/);
  assert.match(manager, /continuation_creation_ambiguous/);
  assert.match(manager, /worker_host_unavailable/);
  assert.match(worker, /No worker may create, fork, or authorize another task/);
  assert.match(worker, /Never repeat an acknowledged action at `started` or `completed`/);
  assert.match(worker, /establish the\s+selected host browser binding while the action is still `authorized`/);
  assert.match(worker, /Never\s+assume a runtime object from an earlier Codex turn still exists/);
  assert.match(
    protocol,
    /`authorized`, `binding_verified`,\s+`start_persisted`, `started`, and `completed`/,
  );
  assert.match(protocol, /prior verification is invalidated by a\s+host continuation/);
  assert.match(protocol, /## Durable checkpoints and host recovery/);
  assert.match(protocol, /retry limit is exactly one recovery continuation/);
  assert.match(protocol, /ambiguous_browser_action/);
  assert.match(protocol, /Repeated terminal processing returns the existing terminal record/);
  assert.match(protocol, /manager is the sole authority for `targetLeaseHash`/);
  assert.match(protocol, /Missing,\s+malformed, or unequal values stop the run before browser access/);
  assert.match(protocol, /durable single-use transition/);
  assert.match(protocol, /QA_AUTHENTICATION_RECOVERY_LEASE/);
  for (const contract of [starter, dispatch, manager, worker, protocol]) {
    assertPostAcknowledgementAcquisitionContract(contract);
  }
});

test("manager-worker protocol excludes omitted capability channels", async () => {
  const protocol = await readFile(protocolPath, "utf8");

  assert.match(protocol, /extra channels are not part of the run/);
  assert.match(protocol, /exact `scenario\.channels` array/);
  assert.match(protocol, /Oracle order is never authoritative/);
  assert.match(protocol, /channel omitted from\s+the scenario/);
});

test("manager configuration schema stores only the absolute QA repository", async () => {
  const schema = JSON.parse(
    await readFile(
      "docs/browser-acceptance/schemas/qa-manager-config.schema.json",
      "utf8",
    ),
  );

  assert.equal(schema.properties.schemaVersion.const, "qa-manager-config/v1");
  assert.deepEqual(schema.required, ["schemaVersion", "qaRepository"]);
  assert.equal(
    schema.properties.qaRepository.pattern,
    "^(?:/|[A-Za-z]:[\\\\/])",
  );
  assert.equal(schema.additionalProperties, false);

  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(
    validate({
      schemaVersion: "qa-manager-config/v1",
      qaRepository: "/example/qa-worker",
    }),
    true,
  );
  assert.equal(
    validate({
      schemaVersion: "qa-manager-config/v1",
      qaRepository: "C:\\example\\qa-worker",
    }),
    true,
  );
  assert.equal(
    validate({
      schemaVersion: "qa-manager-config/v1",
      qaRepository: "relative/qa-worker",
    }),
    false,
  );
});
