#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

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
    if (value === "--scenario" || value === "--oracle") {
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
  const raw = await readFile(path, "utf8");
  const extension = extname(path).toLowerCase();
  const value =
    extension === ".yaml" || extension === ".yml"
      ? parseYaml(raw)
      : JSON.parse(raw);
  return {
    raw,
    value,
    sha256: createHash("sha256").update(raw).digest("hex"),
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
  { requireApproved = false, now = Date.now() } = {},
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
  if (requireApproved && authorization.status !== "approved") {
    push(
      "/authorization/status",
      "approval_required",
      "dispatch requires an explicitly approved scenario",
    );
  }
  if (requireApproved && authorization.browserAccessAuthorized !== true) {
    push(
      "/authorization/browserAccessAuthorized",
      "browser_authorization_required",
      "dispatch requires explicit browser access authorization",
    );
  }

  return errors;
}

export async function validateQaConfig({
  scenarioPath,
  oraclePath,
  requireApproved = false,
}) {
  const [scenarioDocument, oracleDocument, scenarioSchema, oracleSchema] =
    await Promise.all([
      readStructured(scenarioPath),
      readStructured(oraclePath),
      readStructured(scenarioSchemaPath),
      readStructured(oracleSchemaPath),
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
        { requireApproved },
      ),
    );
  }

  return {
    ok: errors.length === 0,
    protocolVersion: oracleDocument.value?.protocolVersion ?? null,
    scenarioId: scenarioDocument.value?.scenarioId ?? null,
    scenarioSha256: scenarioDocument.sha256,
    oracleId: oracleDocument.value?.oracleId ?? null,
    oracleSha256: oracleDocument.sha256,
    approved: scenarioDocument.value?.authorization?.status === "approved",
    browserAccessAuthorized:
      scenarioDocument.value?.authorization?.browserAccessAuthorized === true,
    requireHumanBeforeBrowserAccess:
      scenarioDocument.value?.authorization?.requireHumanBeforeBrowserAccess ??
      null,
    selectedChannels: Array.isArray(scenarioDocument.value?.channels)
      ? [...scenarioDocument.value.channels]
      : null,
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
