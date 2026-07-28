import {
  asJsonValue,
  CONTRACT_VERSION,
  ContractError,
  type CoreReceipt,
  type JsonValue,
  type Observation,
  type OutputEnvelope,
  parseObservation,
  parsePlanAmendment,
  parsePlanRequest,
  type StoredPlan,
} from "../contracts/index.js";
import {
  parseModuleObservationPayload,
  reduceChannelModules,
} from "../modules/registry.js";
import { getChannelModulePolicy } from "../channels/policies/index.js";
import { createId, digest, StateStore } from "../state/store.js";
import type { ParsedArguments } from "./arguments.js";
import { readJsonInput } from "./arguments.js";

export interface CommandResult {
  envelope: OutputEnvelope;
  exitCode: number;
}

function success(
  command: OutputEnvelope["command"],
  data: JsonValue,
  runId?: string,
  warnings: OutputEnvelope["warnings"] = [],
  exitCode = 0,
): CommandResult {
  return {
    envelope: {
      contractVersion: CONTRACT_VERSION,
      command,
      ok: exitCode === 0,
      ...(runId ? { runId } : {}),
      data,
      warnings,
      errors: [],
    },
    exitCode,
  };
}

function latestUnresolvedInterruption(
  observations: Observation[],
  plan: StoredPlan,
): Observation | undefined {
  const interruption = observations.findLast((item) => item.kind === "interruption");
  if (!interruption) return undefined;
  const index = observations.indexOf(interruption);
  const later = observations.slice(index + 1);
  const payload = typeof interruption.payload === "object" && interruption.payload !== null
    ? interruption.payload as Record<string, JsonValue>
    : {};
  const laterSession = later.findLast(
    (item) => item.kind === "session_state" && item.source.kind === "browser_ui",
  );
  if (!laterSession) return interruption;
  if (payload.reason === "locale_mismatch" || payload.reason === "environment_mismatch") {
    const localeMatches =
      laterSession.source.uiLocale === plan.locale.uiLocale &&
      laterSession.source.region === plan.locale.region &&
      laterSession.source.timezone === plan.locale.timezone;
    return localeMatches ? undefined : interruption;
  }
  if (payload.reason !== "ui_change") return undefined;
  const restored = later.some((item) => {
    if (item.kind !== "diagnostic" || typeof item.payload !== "object" || item.payload === null) {
      return false;
    }
    const diagnostic = item.payload as Record<string, JsonValue>;
    return diagnostic.resolution === "assisted_resume" && diagnostic.checkpointsRestored === true;
  });
  return restored ? undefined : interruption;
}

function nextAction(
  plan: StoredPlan,
  observations: Observation[],
  receiptChannelRunIds: string[],
): JsonValue {
  const unfinished = plan.channelRuns.find(
    (channelRun) => !receiptChannelRunIds.includes(channelRun.channelRunId),
  );
  if (!unfinished) return { kind: "complete", runId: plan.runId };
  const channelObservations = observations.filter(
    (observation) => observation.channelRunId === unfinished.channelRunId,
  );
  const interruption = latestUnresolvedInterruption(channelObservations, plan);
  if (interruption) {
    return {
      kind: "resume_interruption",
      runId: plan.runId,
      channelRunId: unfinished.channelRunId,
      channel: unfinished.channel,
      interruptionObservationId: interruption.observationId,
    };
  }
  const decisionsComplete = unfinished.enabledModules.every((moduleName) => {
    if (!getChannelModulePolicy(unfinished.channel, moduleName).supported) return true;
    return channelObservations.some(
      (observation) =>
        observation.module.name === moduleName &&
        observation.kind === "recommendation_decision",
    );
  });
  if (decisionsComplete) {
    return {
      kind: "validate",
      runId: plan.runId,
      channelRunId: unfinished.channelRunId,
      channel: unfinished.channel,
    };
  }
  return {
    kind: "record_observation",
    runId: plan.runId,
    channelRunId: unfinished.channelRunId,
    channel: unfinished.channel,
  };
}

export async function executeCommand(
  args: ParsedArguments,
  cwd: string,
): Promise<CommandResult> {
  const store = new StateStore(cwd, args.stateRoot);
  if (args.command === "unknown") {
    throw new ContractError("Unknown command.", [
      { code: "unknown_command", message: "Expected plan, record-observation, or validate." },
    ]);
  }

  if (args.command === "plan") {
    if (!args.runId) {
      if (!args.json) {
        throw new ContractError("Missing plan request.", [
          { code: "missing_argument", message: "plan requires --json @request.json." },
        ]);
      }
      const request = parsePlanRequest(await readJsonInput(args.json));
      const runId = request.runId ?? createId("run");
      const createdAt = new Date().toISOString();
      const plan: StoredPlan = {
        ...request,
        runId,
        createdAt,
        channelRuns: request.channels.map((channel) => ({
          channelRunId: createId("channel"),
          channel,
          enabledModules: request.enabledModules,
          evidenceTier:
            request.channelOverrides?.[channel]?.evidenceTier ?? request.defaultEvidenceTier,
        })),
      };
      await store.createPlan(plan);
      return success("plan", asJsonValue({
        created: true,
        plan,
        nextAction: nextAction(plan, [], []),
      }), runId);
    }

    const plan = await store.readPlan(args.runId);
    if (args.json) {
      const amendmentInput = parsePlanAmendment(await readJsonInput(args.json), args.runId);
      const amendment = { ...amendmentInput, createdAt: new Date().toISOString() };
      const disposition = await store.appendAmendment(amendment);
      const [observations, receiptChannelRunIds] = await Promise.all([
        store.readObservations(args.runId),
        store.listReceiptChannelRunIds(args.runId),
      ]);
      return success("plan", asJsonValue({
        resumed: true,
        amendment: disposition,
        plan,
        amendments: await store.readAmendments(args.runId),
        nextAction: nextAction(plan, observations, receiptChannelRunIds),
      }), args.runId);
    }
    const [amendments, observations, status, receiptChannelRunIds] = await Promise.all([
      store.readAmendments(args.runId),
      store.readObservations(args.runId),
      store.readStatus(args.runId),
      store.listReceiptChannelRunIds(args.runId),
    ]);
    return success("plan", asJsonValue({
      resumed: true,
      plan,
      amendments,
      status,
      nextAction: nextAction(plan, observations, receiptChannelRunIds),
    }), args.runId);
  }

  if (!args.runId) {
    throw new ContractError("Missing run id.", [
      { code: "missing_argument", message: `${args.command} requires --run <run-id>.` },
    ]);
  }

  if (args.command === "record-observation") {
    if (!args.json) {
      throw new ContractError("Missing observation.", [
        { code: "missing_argument", message: "record-observation requires --json @observation.json." },
      ], 2, args.runId);
    }
    const observation = parseObservation(await readJsonInput(args.json), args.runId);
    parseModuleObservationPayload(observation);
    const disposition = await store.appendObservation(observation);
    const plan = await store.readPlan(args.runId);
    const [observations, receiptChannelRunIds] = await Promise.all([
      store.readObservations(args.runId),
      store.listReceiptChannelRunIds(args.runId),
    ]);
    return success("record-observation", asJsonValue({
      disposition,
      observationId: observation.observationId,
      nextAction: nextAction(plan, observations, receiptChannelRunIds),
    }), args.runId);
  }

  return validateRun(store, args.runId);
}

function interruptionExit(observation: Observation): number {
  const payload = typeof observation.payload === "object" && observation.payload !== null
    ? observation.payload as Record<string, JsonValue>
    : {};
  const reason = payload.reason;
  if (reason === "ui_change") return 5;
  if (reason === "locale_mismatch" || reason === "environment_mismatch") return 6;
  return 4;
}

async function validateRun(store: StateStore, runId: string): Promise<CommandResult> {
  const plan = await store.readPlan(runId);
  const [amendments, observations, receiptChannelRunIds] = await Promise.all([
    store.readAmendments(runId),
    store.readObservations(runId),
    store.listReceiptChannelRunIds(runId),
  ]);
  const channelRun = plan.channelRuns.find(
    (item) => !receiptChannelRunIds.includes(item.channelRunId),
  );
  if (!channelRun) {
    return success("validate", {
      status: "complete",
      receiptChannelRunIds,
      nextAction: nextAction(plan, observations, receiptChannelRunIds),
    }, runId);
  }
  const channelObservations = observations.filter(
    (observation) => observation.channelRunId === channelRun.channelRunId,
  );
  if (channelObservations.length === 0) {
    return success("validate", {
      status: "incomplete",
      reason: "no_observations",
      nextAction: nextAction(plan, observations, receiptChannelRunIds),
    }, runId, [], 3);
  }
  const interruption = latestUnresolvedInterruption(channelObservations, plan);
  if (interruption) {
    const exitCode = interruptionExit(interruption);
    return success("validate", {
      status: exitCode === 5 ? "failed" : "interrupted",
      interruptionObservationId: interruption.observationId,
      resumable: true,
      ...(exitCode === 5 ? { requiresAssistedResume: true } : {}),
    }, runId, [], exitCode);
  }

  const latestSession = channelObservations.findLast(
    (observation) =>
      observation.kind === "session_state" &&
      observation.source.kind === "browser_ui",
  );
  if (
    latestSession &&
    (
      latestSession.source.uiLocale !== plan.locale.uiLocale ||
      latestSession.source.region !== plan.locale.region ||
      latestSession.source.timezone !== plan.locale.timezone
    )
  ) {
    return success("validate", {
      status: "interrupted",
      reason: "locale_or_environment_mismatch",
      sessionObservationId: latestSession.observationId,
      resumable: true,
    }, runId, [], 6);
  }
  const first = channelObservations[0]!;
  const last = channelObservations.at(-1)!;
  const validatedAt = new Date().toISOString();
  const moduleReduction = reduceChannelModules(
    plan,
    amendments,
    observations,
    channelRun.channelRunId,
    validatedAt,
  );
  if (!moduleReduction.complete) {
    return success("validate", asJsonValue({
      status: "incomplete",
      reason: "module_evidence_invalid",
      moduleResults: moduleReduction.moduleResults,
    }), runId, [], 3);
  }
  const receipt: CoreReceipt = {
    contractVersion: CONTRACT_VERSION,
    receiptVersion: "1.0",
    receiptId: `receipt_${digest({
      runId,
      channelRunId: channelRun.channelRunId,
      observations: channelObservations,
      amendments,
    }).slice(0, 24)}`,
    runId,
    channelRunId: channelRun.channelRunId,
    planDigest: digest(plan),
    amendmentReferences: amendments.map((item) => item.amendmentId),
    channel: channelRun.channel,
    enabledModules: channelRun.enabledModules,
    createdAt: plan.createdAt,
    capturedAt: { first: first.capturedAt, last: last.capturedAt },
    validatedAt,
    requestedLocale: plan.locale,
    observedLocale: {
      uiLocale: (latestSession ?? last).source.uiLocale,
      region: (latestSession ?? last).source.region,
      timezone: (latestSession ?? last).source.timezone,
    },
    browser: (latestSession ?? last).source.browser,
    accessMode: (latestSession ?? last).source.accessMode,
    personalizedSession: (latestSession ?? last).source.personalizedSession,
    evidenceTier: channelRun.evidenceTier,
    observationReferences: channelObservations.map((item) => item.observationId),
    status: "complete",
    warnings: moduleReduction.moduleResults.flatMap((item) => item.warnings),
    failures: [],
    moduleResults: Object.fromEntries(
      moduleReduction.moduleResults.map((item) => [item.module, asJsonValue(item)]),
    ),
  };
  const receiptPath = await store.writeReceipt(runId, channelRun.channelRunId, receipt);
  await store.writeStatus({
    contractVersion: CONTRACT_VERSION,
    runId,
    state: "validated",
    updatedAt: validatedAt,
    latestReceipt: receiptPath,
  });
  const completedReceiptIds = [...receiptChannelRunIds, channelRun.channelRunId];
  return success("validate", asJsonValue({
    status: "complete",
    receipt,
    nextAction: nextAction(plan, observations, completedReceiptIds),
  }), runId, receipt.warnings);
}
