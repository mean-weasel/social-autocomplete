import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import { checkQaCompatibility, validateQaConfig } from
  "../../scripts/browser-acceptance/validate-qa-config.mjs";

const scenarioPath = "docs/browser-acceptance/scenarios/examples/chrome-instagram-single-task-autocomplete.yaml";
const oraclePath = "docs/browser-acceptance/oracles/chrome-authenticated-research.yaml";

test("single-task Instagram example is bounded and validates", async () => {
  const result = await validateQaConfig({ scenarioPath, oraclePath });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.interactionSource, "single_task");
  assert.equal(result.protocolVersion, "qa-single-task/v1");
  assert.deepEqual(result.selectedChannels, ["instagram"]);
  assert.equal(result.approved, false);
  assert.equal(result.completedResearchTabs, "close");
  const scenario = parse(await readFile(scenarioPath, "utf8"));
  assert.deepEqual(scenario.modules, ["hashtag"]);
  assert.deepEqual(scenario.queryPrefixes, { hashtag: ["#productivity"] });
  assert.equal(scenario.completedResearchTabs, "close");
  assert.equal(scenario.bounds.maxPrefixesPerModule, 1);
  assert.equal(scenario.bounds.maxSuggestionsPerPrefix, 5);
});

test("single-task config can retain the completed research tab", async () => {
  const scenario = parse(await readFile(scenarioPath, "utf8"));
  scenario.completedResearchTabs = "keep_open";
  const directory = await mkdtemp(join(tmpdir(), "social-metadata-tabs-"));
  const retainedScenarioPath = join(directory, "keep-open.yaml");
  await writeFile(retainedScenarioPath, stringify(scenario), "utf8");
  const result = await validateQaConfig({
    scenarioPath: retainedScenarioPath,
    oraclePath,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.completedResearchTabs, "keep_open");
});

test("single-task prefixes cover enabled modules and bounds", async () => {
  const scenario = parse(await readFile(scenarioPath, "utf8"));
  const oracle = parse(await readFile(oraclePath, "utf8"));
  const errorCodes = (value) =>
    checkQaCompatibility(value, oracle).map((error) => error.code);
  const missing = structuredClone(scenario);
  delete missing.queryPrefixes.hashtag;
  assert.ok(errorCodes(missing).includes("query_prefix_module_coverage"));
  const overBound = structuredClone(scenario);
  overBound.queryPrefixes.hashtag.push("#productivityapp");
  assert.ok(errorCodes(overBound).includes("query_prefix_bound_exceeded"));
});

test("single-task contracts retain browser ownership", async () => {
  const [runbook, starter] = await Promise.all([
    readFile("docs/browser-acceptance/runbooks/qa-single-task.md", "utf8"),
    readFile("docs/browser-acceptance/prompts/qa-single-task-starter.md", "utf8"),
  ]);
  for (const contract of [runbook, starter]) {
    assert.match(contract, /one (?:fresh )?Codex task/i);
    assert.match(contract, /retain(?:ed)? (?:that |the )?binding/i);
    assert.match(contract, /existing,? visible Chrome/i);
    assert.match(contract, /one\s+new\s+plugin-owned Instagram tab/i);
    assert.match(contract, /social-metadata validate/i);
    assert.doesNotMatch(contract, /APPROVE QA BROWSER CAMPAIGN|ambiguous_browser_action/i);
  }
  assert.match(runbook, /There is no `QA_EVENT`, `QA_CHECKPOINT_ACK`/i);
  assert.match(runbook, /passes only when every configured module captures/i);
  assert.match(starter, /Do not create a manager,\s+worker, child task/i);
  assert.match(starter, /`keep_open`.*deliverable/is);
});
