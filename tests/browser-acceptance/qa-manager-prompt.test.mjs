import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const managerStarterPath =
  "docs/browser-acceptance/prompts/qa-manager-starter.md";
const workerDispatchPath =
  "docs/browser-acceptance/prompts/qa-worker-dispatch.md";

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
