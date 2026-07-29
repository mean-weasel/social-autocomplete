import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import {
  checkQaCompatibility,
  validateQaConfig,
} from "../../scripts/browser-acceptance/validate-qa-config.mjs";

const scenarioPath = resolve(
  "docs/browser-acceptance/scenarios/examples/chrome-all-channels-autocomplete.yaml",
);
const chromeOraclePath = resolve(
  "docs/browser-acceptance/oracles/chrome-authenticated-research.yaml",
);
const inAppOraclePath = resolve(
  "docs/browser-acceptance/oracles/in-app-public-research.yaml",
);
const chromeChannels = [
  "facebook",
  "instagram",
  "linkedin",
  "x",
  "tiktok",
  "youtube",
  "pinterest",
];
const inAppChannels = ["tiktok", "youtube", "pinterest"];

function orderedNonEmptySelections(values) {
  const selections = [];
  const visit = (prefix, remaining) => {
    for (let index = 0; index < remaining.length; index += 1) {
      const next = [...prefix, remaining[index]];
      selections.push(next);
      visit(next, [
        ...remaining.slice(0, index),
        ...remaining.slice(index + 1),
      ]);
    }
  };
  visit([], values);
  return selections;
}

function scenarioFor(base, browser, channels) {
  const scenario = structuredClone(base);
  scenario.scenarioId = `ordered_subset_${browser}_${channels.join("_")}`;
  scenario.browser = browser;
  scenario.channels = [...channels];
  const expectedState =
    browser === "chrome" ? "already_signed_in" : "public_surface";
  scenario.authentication.byChannel = Object.fromEntries(
    channels.map((channel) => [channel, { expectedState }]),
  );
  return scenario;
}

async function writeStructuredFixture(value, name) {
  const directory = await mkdtemp(join(tmpdir(), "social-metadata-qa-"));
  const path = join(directory, name);
  await writeFile(path, stringify(value), "utf8");
  return path;
}

test("committed example validates against the independent Chrome capability oracle", async () => {
  const result = await validateQaConfig({
    scenarioPath,
    oraclePath: chromeOraclePath,
  });
  assert.equal(result.ok, true);
  assert.equal(result.approved, false);
  assert.equal(result.browserAccessAuthorized, false);
  assert.equal(result.scenarioId, "chrome_all_channels_autocomplete");
  assert.equal(result.oracleId, "chrome_authenticated_research_v2");
  assert.deepEqual(result.selectedChannels, chromeChannels);
});

test("all 13,699 nonempty ordered Chrome subsets are compatible without mutation", async () => {
  const base = parse(await readFile(scenarioPath, "utf8"));
  const oracle = parse(await readFile(chromeOraclePath, "utf8"));
  const selections = orderedNonEmptySelections(chromeChannels);

  assert.equal(selections.length, 13_699);
  for (const channels of selections) {
    const scenario = scenarioFor(base, "chrome", channels);
    const before = [...scenario.channels];
    const errors = checkQaCompatibility(scenario, oracle);
    assert.deepEqual(
      errors,
      [],
      `unexpected compatibility error for ${channels.join(" -> ")}`,
    );
    assert.deepEqual(scenario.channels, before);
  }
});

test("all 15 nonempty ordered in-app subsets are compatible without mutation", async () => {
  const base = parse(await readFile(scenarioPath, "utf8"));
  const oracle = parse(await readFile(inAppOraclePath, "utf8"));
  const selections = orderedNonEmptySelections(inAppChannels);

  assert.equal(selections.length, 15);
  for (const channels of selections) {
    const scenario = scenarioFor(base, "in_app", channels);
    const before = [...scenario.channels];
    const errors = checkQaCompatibility(scenario, oracle);
    assert.deepEqual(
      errors,
      [],
      `unexpected compatibility error for ${channels.join(" -> ")}`,
    );
    assert.deepEqual(scenario.channels, before);
  }
});

test("a three-channel scenario keeps its unrelated ID and exact selected order", async () => {
  const base = parse(await readFile(scenarioPath, "utf8"));
  const scenario = scenarioFor(base, "chrome", [
    "instagram",
    "facebook",
    "linkedin",
  ]);
  scenario.scenarioId = "chrome_instagram_facebook_linkedin_autocomplete";
  const privateScenarioPath = await writeStructuredFixture(
    scenario,
    "three-channel.yaml",
  );

  const result = await validateQaConfig({
    scenarioPath: privateScenarioPath,
    oraclePath: chromeOraclePath,
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.scenarioId,
    "chrome_instagram_facebook_linkedin_autocomplete",
  );
  assert.deepEqual(result.selectedChannels, [
    "instagram",
    "facebook",
    "linkedin",
  ]);
});

test("dispatch validation rejects an unapproved scenario", async () => {
  const result = await validateQaConfig({
    scenarioPath,
    oraclePath: chromeOraclePath,
    requireApproved: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "approval_required"));
});

test("dispatch validation accepts explicit approval without credential authority", async () => {
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
  const privateScenarioPath = await writeStructuredFixture(
    scenario,
    "approved.yaml",
  );

  const result = await validateQaConfig({
    scenarioPath: privateScenarioPath,
    oraclePath: chromeOraclePath,
    requireApproved: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.approved, true);
  assert.equal(result.browserAccessAuthorized, true);
});

test("scenario authentication coverage must exactly equal selected channels", async () => {
  const scenario = parse(await readFile(scenarioPath, "utf8"));
  delete scenario.authentication.byChannel.youtube;
  const invalidScenarioPath = await writeStructuredFixture(
    scenario,
    "missing-auth-channel.yaml",
  );

  const result = await validateQaConfig({
    scenarioPath: invalidScenarioPath,
    oraclePath: chromeOraclePath,
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (error) => error.code === "authentication_channel_coverage",
    ),
  );
});

test("empty and duplicate channel selections fail scenario schema validation", async () => {
  const base = parse(await readFile(scenarioPath, "utf8"));
  const empty = scenarioFor(base, "chrome", []);
  const duplicate = scenarioFor(base, "chrome", ["youtube", "youtube"]);
  const emptyPath = await writeStructuredFixture(empty, "empty.yaml");
  const duplicatePath = await writeStructuredFixture(
    duplicate,
    "duplicate.yaml",
  );

  const [emptyResult, duplicateResult] = await Promise.all([
    validateQaConfig({
      scenarioPath: emptyPath,
      oraclePath: chromeOraclePath,
    }),
    validateQaConfig({
      scenarioPath: duplicatePath,
      oraclePath: chromeOraclePath,
    }),
  ]);
  assert.equal(emptyResult.ok, false);
  assert.ok(emptyResult.errors.some((error) => error.code === "minItems"));
  assert.equal(duplicateResult.ok, false);
  assert.ok(
    duplicateResult.errors.some((error) => error.code === "uniqueItems"),
  );
});

test("browser, channel, and authentication incompatibilities fail visibly", async () => {
  const base = parse(await readFile(scenarioPath, "utf8"));
  const chromeOracle = parse(await readFile(chromeOraclePath, "utf8"));
  const inAppOracle = parse(await readFile(inAppOraclePath, "utf8"));

  const browserMismatch = scenarioFor(base, "chrome", ["youtube"]);
  assert.ok(
    checkQaCompatibility(browserMismatch, inAppOracle).some(
      (error) => error.code === "oracle_browser_mismatch",
    ),
  );

  const unavailable = scenarioFor(base, "in_app", ["facebook"]);
  assert.ok(
    checkQaCompatibility(unavailable, inAppOracle).some(
      (error) => error.code === "oracle_channel_unsupported",
    ),
  );

  const wrongAuthentication = scenarioFor(base, "chrome", ["facebook"]);
  wrongAuthentication.authentication.byChannel.facebook.expectedState =
    "public_surface";
  assert.ok(
    checkQaCompatibility(wrongAuthentication, chromeOracle).some(
      (error) => error.code === "oracle_authentication_mismatch",
    ),
  );
});

test("capability oracle integrity requires outcomes for exactly advertised channels", async () => {
  const base = parse(await readFile(scenarioPath, "utf8"));
  const oracle = parse(await readFile(chromeOraclePath, "utf8"));
  const scenario = scenarioFor(base, "chrome", ["linkedin"]);

  delete oracle.channelOutcomes.linkedin;
  assert.ok(
    checkQaCompatibility(scenario, oracle).some(
      (error) => error.code === "oracle_channel_outcome_missing",
    ),
  );

  oracle.channelOutcomes.linkedin = ["ready"];
  oracle.applicability.availableChannels =
    oracle.applicability.availableChannels.filter(
      (channel) => channel !== "linkedin",
    );
  assert.ok(
    checkQaCompatibility(scenario, oracle).some(
      (error) => error.code === "oracle_channel_outcome_unadvertised",
    ),
  );
});

test("oracle schema prevents unsafe in-app capability expansion", async () => {
  const base = parse(await readFile(scenarioPath, "utf8"));
  const scenario = scenarioFor(base, "in_app", ["youtube"]);
  const oracle = parse(await readFile(inAppOraclePath, "utf8"));
  oracle.applicability.authenticationStates = ["already_signed_in"];
  oracle.applicability.availableChannels.push("facebook");
  oracle.channelOutcomes.facebook = ["ready"];
  const scenarioFixturePath = await writeStructuredFixture(
    scenario,
    "in-app.yaml",
  );
  const oracleFixturePath = await writeStructuredFixture(
    oracle,
    "unsafe-oracle.yaml",
  );

  const result = await validateQaConfig({
    scenarioPath: scenarioFixturePath,
    oraclePath: oracleFixturePath,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.source === "oracle"));
});

test("Pinterest hashtag remains an explicit capability-level not-applicable outcome", async () => {
  const [chromeOracle, inAppOracle] = await Promise.all([
    readFile(chromeOraclePath, "utf8").then(parse),
    readFile(inAppOraclePath, "utf8").then(parse),
  ]);
  assert.ok(chromeOracle.channelOutcomes.pinterest.includes("not_applicable"));
  assert.ok(inAppOracle.channelOutcomes.pinterest.includes("not_applicable"));
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
  assert.match(managerRunbook, /\.social-metadata\/qa\/scenarios\//);
  assert.match(
    workerRunbook,
    /worker task is\s+rooted in the dedicated QA repository/,
  );
  assert.match(
    acceptanceReadme,
    /Run the manager and its\s+configuration interview from this development repository/,
  );
});
