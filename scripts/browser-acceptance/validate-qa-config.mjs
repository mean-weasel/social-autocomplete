#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { assertQaCampaignChildGrant, parseQaStrictJson } from "./qa-campaign.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const scenarioSchemaPath = resolve(
  repositoryRoot,
  "docs/browser-acceptance/schemas/qa-scenario.schema.json",
);
const oracleSchemaPath = resolve(
  repositoryRoot,
  "docs/browser-acceptance/schemas/qa-oracle.schema.json",
);

function parseArguments(argv) {
  const options = { requireApproved: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--require-approved") {
      options.requireApproved = true;
      continue;
    }
    if (
      value === "--scenario" ||
      value === "--oracle" ||
      value === "--campaign-grant"
    ) {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`${value} requires a path`);
      }
      options[value.slice(2)] = resolve(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.scenario || !options.oracle) {
    throw new Error("--scenario and --oracle are required");
  }
  return options;
}

async function readStructured(path) {
  const bytes = await readFile(path);
  // Pin exact artifact bytes first. Decoding/parsing is deliberately separate:
  // YAML formatting, comments, BOMs, and line endings are all part of a pin.
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    throw new Error(`${path} must not contain a UTF-8 BOM`);
  }
  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${path} must be valid UTF-8`);
  }
  const extension = extname(path).toLowerCase();
  const value =
    extension === ".yaml" || extension === ".yml"
      ? parseYaml(raw)
      // Configuration artifacts that are JSON, including detached campaign
      // grants, must reject duplicate decoded member names before validation.
      : parseQaStrictJson(raw, path);
  return {
    raw,
    value,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function formatAjvErrors(label, errors) {
  return (errors ?? []).map((error) => ({
    source: label,
    path: error.instancePath || "/",
    code: error.keyword,
    message: error.message,
  }));
}

export function checkQaCompatibility(
  scenario,
  oracle,
  { requireApproved = false, now = Date.now(), campaignGrant = null,
    scenarioSha256 = null, oracleSha256 = null } = {},
) {
  const errors = [];
  const push = (path, code, message) =>
    errors.push({ source: "cross_contract", path, code, message });

  const selectedChannels = scenario.channels ?? [];
  const authenticationChannels = Object.keys(
    scenario.authentication?.byChannel ?? {},
  );
  if (
    authenticationChannels.length !== selectedChannels.length ||
    selectedChannels.some(
      (channel) => !authenticationChannels.includes(channel),
    )
  ) {
    push(
      "/authentication/byChannel",
      "authentication_channel_coverage",
      "authentication.byChannel must contain exactly the selected channels",
    );
  }

  if (scenario.interactionSource === "single_task") {
    const prefixes = scenario.queryPrefixes ?? {};
    const prefixModules = Object.keys(prefixes);
    const enabledModules = scenario.modules ?? [];
    if (
      prefixModules.length !== enabledModules.length ||
      enabledModules.some((moduleName) => !prefixModules.includes(moduleName))
    ) {
      push(
        "/queryPrefixes",
        "query_prefix_module_coverage",
        "single-task queryPrefixes must contain exactly the enabled modules",
      );
    }
    for (const [moduleName, values] of Object.entries(prefixes)) {
      if (
        Array.isArray(values) &&
        values.length > (scenario.bounds?.maxPrefixesPerModule ?? 0)
      ) {
        push(
          `/queryPrefixes/${moduleName}`,
          "query_prefix_bound_exceeded",
          "query prefix count exceeds maxPrefixesPerModule",
        );
      }
    }
  }

  const applicability = oracle.applicability ?? {};
  const availableChannels = applicability.availableChannels ?? [];
  const oracleChannels = Object.keys(oracle.channelOutcomes ?? {});
  for (const channel of availableChannels) {
    if (!oracleChannels.includes(channel)) {
      push(
        `/channelOutcomes/${channel}`,
        "oracle_channel_outcome_missing",
        `capability oracle advertises a channel without outcomes: ${channel}`,
      );
    }
  }
  for (const channel of oracleChannels) {
    if (!availableChannels.includes(channel)) {
      push(
        `/channelOutcomes/${channel}`,
        "oracle_channel_outcome_unadvertised",
        `capability oracle defines outcomes for an unadvertised channel: ${channel}`,
      );
    }
  }

  if (scenario.browser !== applicability.browser) {
    push(
      "/browser",
      "oracle_browser_mismatch",
      "scenario browser is not supported by this capability oracle",
    );
  }
  if (!applicability.scopes?.includes(scenario.scope)) {
    push(
      "/scope",
      "oracle_scope_unsupported",
      "scenario scope is not supported by this capability oracle",
    );
  }
  if (
    scenario.modules?.some(
      (moduleName) => !applicability.modules?.includes(moduleName),
    )
  ) {
    push(
      "/modules",
      "oracle_module_unsupported",
      "scenario module is not supported by this capability oracle",
    );
  }
  if (!applicability.evidenceTiers?.includes(scenario.evidenceTier)) {
    push(
      "/evidenceTier",
      "oracle_evidence_tier_unsupported",
      "scenario evidence tier is not supported by this capability oracle",
    );
  }
  if (!applicability.modes?.includes(scenario.mode)) {
    push(
      "/mode",
      "oracle_mode_unsupported",
      "scenario mode is not supported by this capability oracle",
    );
  }

  for (const [index, channel] of selectedChannels.entries()) {
    if (!availableChannels.includes(channel)) {
      push(
        `/channels/${index}`,
        "oracle_channel_unsupported",
        `${channel} is not available in this capability oracle`,
      );
    }
    const expectedState =
      scenario.authentication?.byChannel?.[channel]?.expectedState;
    if (!applicability.authenticationStates?.includes(expectedState)) {
      push(
        `/authentication/byChannel/${channel}/expectedState`,
        "oracle_authentication_mismatch",
        `${expectedState ?? "missing"} authentication is not supported`,
      );
    }
  }

  const authorization = scenario.authorization ?? {};
  let campaignGrantAuthorizes = false;
  if (authorization.credentialsAuthorized !== false) {
    push(
      "/authorization/credentialsAuthorized",
      "unsafe_authorization",
      "credentials may never be authorized",
    );
  }
  if (authorization.expiresAt && Date.parse(authorization.expiresAt) <= now) {
    push(
      "/authorization/expiresAt",
      "approval_expired",
      "scenario approval has expired",
    );
  }
  const campaign = authorization.campaign;
  if (campaign) {
    if (authorization.reusable !== false) {
      push(
        "/authorization/reusable",
        "campaign_grant_not_one_time",
        "campaign child scenarios must remain one-time",
      );
    }
    if (
      scenario.scope !== "research" ||
      scenario.browser !== "chrome" ||
      JSON.stringify(scenario.channels) !==
        JSON.stringify(["instagram", "facebook", "linkedin"]) ||
      JSON.stringify(scenario.modules) !==
        JSON.stringify(["hashtag", "search-term"]) ||
      scenario.evidenceTier !== "autocomplete_only"
    ) {
      push(
        "/authorization/campaign",
        "campaign_scope_mismatch",
        "campaign child scenario changed immutable campaign scope",
      );
    }
    if (requireApproved && !campaignGrant) {
      push(
        "/authorization/campaign",
        "campaign_grant_required",
        "campaign dispatch requires the exact durable child grant",
      );
    }
    if (campaignGrant) {
      try {
        assertQaCampaignChildGrant(campaignGrant);
        if (
          campaign.campaignId !== campaignGrant.campaignId ||
          campaign.campaignScopeSha256 !==
            campaignGrant.campaignScopeSha256 ||
          scenario.scenarioId !== campaignGrant.scenarioId ||
          scenarioSha256 !== campaignGrant.scenarioSha256 ||
          oracleSha256 !== campaignGrant.oracleSha256 ||
          scenario.browser !== campaignGrant.browser ||
          JSON.stringify(scenario.channels) !==
            JSON.stringify(campaignGrant.channels)
        ) {
          push(
            "/authorization/campaign",
            "campaign_grant_mismatch",
            "scenario does not exactly match the campaign child grant",
          );
        } else {
          campaignGrantAuthorizes = true;
        }
      } catch {
        push(
          "/authorization/campaign",
          "campaign_grant_invalid",
          "campaign child grant is malformed",
        );
      }
    }
  } else if (campaignGrant) {
    push(
      "/authorization/campaign",
      "campaign_binding_missing",
      "campaign grant was supplied for an unbound scenario",
    );
  }
  if (
    requireApproved &&
    authorization.status !== "approved" &&
    !campaignGrantAuthorizes
  ) {
    push(
      "/authorization/status",
      "approval_required",
      "dispatch requires an explicitly approved scenario or exact campaign child grant",
    );
  }
  if (
    requireApproved &&
    authorization.browserAccessAuthorized !== true &&
    !campaignGrantAuthorizes
  ) {
    push(
      "/authorization/browserAccessAuthorized",
      "browser_authorization_required",
      "dispatch requires explicit browser access authorization or exact campaign child grant",
    );
  }

  return errors;
}

export async function validateQaConfig({
  scenarioPath,
  oraclePath,
  requireApproved = false,
  campaignGrantPath = null,
}) {
  const [scenarioDocument, oracleDocument, scenarioSchema, oracleSchema, campaignGrantDocument] =
    await Promise.all([
      readStructured(scenarioPath),
      readStructured(oraclePath),
      readStructured(scenarioSchemaPath),
      readStructured(oracleSchemaPath),
      campaignGrantPath ? readStructured(campaignGrantPath) : null,
    ]);

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateScenario = ajv.compile(scenarioSchema.value);
  const validateOracle = ajv.compile(oracleSchema.value);
  const scenarioValid = validateScenario(scenarioDocument.value);
  const oracleValid = validateOracle(oracleDocument.value);
  const errors = [
    ...formatAjvErrors("scenario", validateScenario.errors),
    ...formatAjvErrors("oracle", validateOracle.errors),
  ];

  if (scenarioValid && oracleValid) {
    errors.push(
      ...checkQaCompatibility(
        scenarioDocument.value,
        oracleDocument.value,
        {
          requireApproved,
          campaignGrant: campaignGrantDocument?.value ?? null,
          scenarioSha256: scenarioDocument.sha256,
          oracleSha256: oracleDocument.sha256,
        },
      ),
    );
  }

  const campaignGrantAuthorizes =
    requireApproved &&
    campaignGrantDocument !== null &&
    scenarioDocument.value?.authorization?.campaign !== undefined &&
    errors.length === 0;

  return {
    ok: errors.length === 0,
    protocolVersion: scenarioDocument.value?.interactionSource === "single_task" ? "qa-single-task/v1" : oracleDocument.value?.protocolVersion ?? null,
    scenarioId: scenarioDocument.value?.scenarioId ?? null,
    interactionSource: scenarioDocument.value?.interactionSource ?? null,
    scenarioSha256: scenarioDocument.sha256,
    oracleId: oracleDocument.value?.oracleId ?? null,
    oracleSha256: oracleDocument.sha256,
    approved:
      scenarioDocument.value?.authorization?.status === "approved" ||
      campaignGrantAuthorizes,
    browserAccessAuthorized:
      scenarioDocument.value?.authorization?.browserAccessAuthorized === true ||
      campaignGrantAuthorizes,
    requireHumanBeforeBrowserAccess:
      scenarioDocument.value?.authorization?.requireHumanBeforeBrowserAccess ??
      null,
    selectedChannels: Array.isArray(scenarioDocument.value?.channels)
      ? [...scenarioDocument.value.channels]
      : null,
    campaignId:
      scenarioDocument.value?.authorization?.campaign?.campaignId ?? null,
    campaignGrantSha256: campaignGrantDocument?.value?.grantSha256 ?? null,
    errors,
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await validateQaConfig({
      scenarioPath: options.scenario,
      oraclePath: options.oracle,
      requireApproved: options.requireApproved,
      campaignGrantPath: options["campaign-grant"] ?? null,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        code: "qa_config_validation_error",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
