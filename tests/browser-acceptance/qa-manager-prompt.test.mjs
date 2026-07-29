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
});

test("documentation exposes starter, manager, worker dispatch, and worker runbook", async () => {
  const [readme, managerRunbook] = await Promise.all([
    readFile("docs/browser-acceptance/README.md", "utf8"),
    readFile("docs/browser-acceptance/runbooks/qa-manager.md", "utf8"),
  ]);

  assert.match(
    readme,
    /Follow docs\/browser-acceptance\/prompts\/qa-manager-starter\.md\./,
  );
  assert.match(readme, /prompts\/qa-worker-dispatch\.md/);
  assert.match(readme, /runbooks\/qa-worker\.md/);
  assert.match(managerRunbook, /prompts\/qa-worker-dispatch\.md/);
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
