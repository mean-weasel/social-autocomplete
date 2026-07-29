import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const templatePath =
  "docs/browser-acceptance/templates/qa-manager-launch-prompt.md";

test("saved manager launch prompt is directly executable and self-resolving", async () => {
  const template = await readFile(templatePath, "utf8");

  assert.match(template, /^QA manager launch prompt contract: qa-manager-launch\/v2/);
  assert.doesNotMatch(template, /\{\{[A-Z0-9_]+\}\}/);
  assert.match(template, /current project root as the product repository/);
  assert.match(template, /git rev-parse HEAD/);
  assert.match(template, /\.social-metadata\/qa\/manager-config\.json/);
  assert.match(template, /ask the user to\s+choose and confirm the absolute QA repository path/);
  assert.match(template, /allow\s+the user to amend it/);
  assert.match(template, /Recommend `configure_and_run`/);
});

test("saved manager launch prompt preserves ownership and safety gates", async () => {
  const template = await readFile(templatePath, "utf8");

  assert.match(template, /manager configuration is product-repository owned/i);
  assert.match(template, /QA\s+repository is worker-only/);
  assert.match(template, /explicitly approved/);
  assert.match(template, /manager must not\s+operate the browser/);
  assert.match(template, /Never request or handle credentials/);
  assert.match(template, /genuinely fresh Codex worker task/);
});

test("documentation starts the saved prompt directly without a rendering command", async () => {
  const [readme, runbook] = await Promise.all([
    readFile("docs/browser-acceptance/README.md", "utf8"),
    readFile("docs/browser-acceptance/qa-manager-runbook.md", "utf8"),
  ]);

  assert.match(
    readme,
    /Follow docs\/browser-acceptance\/templates\/qa-manager-launch-prompt\.md\./,
  );
  assert.doesNotMatch(readme, /qa:manager:prompt/);
  assert.doesNotMatch(runbook, /qa:manager:prompt/);
  assert.match(
    runbook,
    /qa-manager-config\.schema\.json/,
  );
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
