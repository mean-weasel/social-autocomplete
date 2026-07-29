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
  assert.match(dispatch, /browser_action_started/);
  assert.match(dispatch, /Never resend an accepted response/);
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
  assert.match(runbook, /do not return a final answer while the worker remains active/);
  assert.match(runbook, /Do not substitute shell\s+polling, a recurring automation, or an operating-system timer/);

  assert.match(protocol, /## Transport and liveness/);
  assert.match(protocol, /wait timeout is a local manager\s+heartbeat only/);
  assert.match(protocol, /must never be converted into `run_complete` or `run_stopped`/);
  assert.match(protocol, /waits again without sending a status ping/);
});

test("protocol and runbooks define fail-closed single-owner host recovery", async () => {
  const [manager, worker, protocol] = await Promise.all([
    readFile(managerRunbookPath, "utf8"),
    readFile("docs/browser-acceptance/runbooks/qa-worker.md", "utf8"),
    readFile(protocolPath, "utf8"),
  ]);

  assert.match(manager, /exact retry limit is one/);
  assert.match(manager, /Only the manager may recover/);
  assert.match(manager, /continuation_creation_ambiguous/);
  assert.match(manager, /worker_host_unavailable/);
  assert.match(worker, /No worker may create, fork, or authorize another task/);
  assert.match(worker, /Never repeat an action at `started` or `completed`/);
  assert.match(protocol, /## Durable checkpoints and host recovery/);
  assert.match(protocol, /retry limit is exactly one recovery continuation/);
  assert.match(protocol, /ambiguous_browser_action/);
  assert.match(protocol, /Repeated terminal processing returns the existing terminal record/);
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
