import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import { validateQaConfig } from "../../scripts/browser-acceptance/validate-qa-config.mjs";

const scenarioPath = resolve(
  "docs/browser-acceptance/scenarios/examples/chrome-all-channels-autocomplete.yaml",
);
const oraclePath = resolve(
  "docs/browser-acceptance/oracles/chrome-all-channels-autocomplete.yaml",
);

test("committed scenario and independent oracle validate as an unapproved template", async () => {
  const result = await validateQaConfig({ scenarioPath, oraclePath });
  assert.equal(result.ok, true);
  assert.equal(result.approved, false);
  assert.equal(result.browserAccessAuthorized, false);
  assert.equal(result.scenarioId, "chrome_all_channels_autocomplete");
});

test("dispatch validation rejects an unapproved scenario", async () => {
  const result = await validateQaConfig({
    scenarioPath,
    oraclePath,
    requireApproved: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "approval_required"));
});

test("dispatch validation accepts explicit approval without credential authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "social-metadata-qa-"));
  const privateScenarioPath = join(directory, "approved.yaml");
  const scenario = parse(await readFile(scenarioPath, "utf8"));
  scenario.authorization = {
    ...scenario.authorization,
    status: "approved",
    approvedAt: "2099-01-01T00:00:00Z",
    expiresAt: "2099-12-31T00:00:00Z",
    requireHumanBeforeBrowserAccess: false,
    browserAccessAuthorized: true,
    credentialsAuthorized: false,
  };
  await writeFile(privateScenarioPath, stringify(scenario), "utf8");

  const result = await validateQaConfig({
    scenarioPath: privateScenarioPath,
    oraclePath,
    requireApproved: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.approved, true);
  assert.equal(result.browserAccessAuthorized, true);
});

test("scenario authentication coverage cannot omit a selected channel", async () => {
  const directory = await mkdtemp(join(tmpdir(), "social-metadata-qa-"));
  const invalidScenarioPath = join(directory, "invalid.yaml");
  const scenario = parse(await readFile(scenarioPath, "utf8"));
  delete scenario.authentication.byChannel.youtube;
  await writeFile(invalidScenarioPath, stringify(scenario), "utf8");

  const result = await validateQaConfig({
    scenarioPath: invalidScenarioPath,
    oraclePath,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "channel_coverage"));
});

test("manager configuration is product-owned and workers are QA-repository isolated", async () => {
  const [managerRunbook, workerRunbook, acceptanceReadme] = await Promise.all([
    readFile("docs/browser-acceptance/runbooks/qa-manager.md", "utf8"),
    readFile("docs/browser-acceptance/runbooks/qa-worker.md", "utf8"),
    readFile("docs/browser-acceptance/README.md", "utf8"),
  ]);

  assert.match(
    managerRunbook,
    /manager task rooted in the Social Metadata Research\s+development repository/,
  );
  assert.match(
    managerRunbook,
    /fresh worker task rooted in the dedicated QA repository/,
  );
  assert.match(
    managerRunbook,
    /\.social-metadata\/qa\/scenarios\//,
  );
  assert.match(
    workerRunbook,
    /worker task is\s+rooted in the dedicated QA repository/,
  );
  assert.match(
    acceptanceReadme,
    /Run the manager and its\s+configuration interview from this development repository/,
  );
});
