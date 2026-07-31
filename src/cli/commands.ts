import {
  asJsonValue,
  CONTRACT_VERSION,
  ContractError,
  type CoreReceipt,
  effectiveCompletedResearchTabs,
  effectiveBrowserSelection,
  type JsonValue,
  type Observation,
  type OutputEnvelope,
  parseObservation,
  parsePlanAmendment,
  parsePlanRequest,
  type BrowserSelection,
  type PlanAmendment,
  type StoredPlan,
} from "../contracts/index.js";
import { getPlaybook } from "../channels/index.js";
import { getChannelModulePolicy } from "../channels/policies/index.js";
import {
  parseModuleObservationPayload,
  reduceChannelModules,
} from "../modules/registry.js";
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
  amendments: PlanAmendment[],
  observations: Observation[],
  receiptChannelRunIds: string[],
): JsonValue {
  const browserSelection = effectiveBrowserSelection(plan, amendments);
  const completedResearchTabs = effectiveCompletedResearchTabs(plan);
  const unfinished = plan.channelRuns.find(
    (channelRun) => !receiptChannelRunIds.includes(channelRun.channelRunId),
  );
  if (!unfinished) return asJsonValue({
    kind: "complete", runId: plan.runId, browserSelection, completedResearchTabs,
  });
  const allowedBrowsers = getPlaybook(unfinished.channel).supportedBrowsers.codex;
  if (!allowedBrowsers.includes(browserSelection.browser)) {
    return asJsonValue({
      kind: "amend_browser_selection",
      runId: plan.runId,
      channelRunId: unfinished.channelRunId,
      channel: unfinished.channel,
      browserSelection,
      completedResearchTabs,
      allowedBrowsers,
    });
  }
  const channelObservations = observations.filter(
    (observation) => observation.channelRunId === unfinished.channelRunId,
  );
  const interruption = latestUnresolvedInterruption(channelObservations, plan);
  if (interruption) {
    return asJsonValue({
      kind: "resume_interruption",
      runId: plan.runId,
      channelRunId: unfinished.channelRunId,
      channel: unfinished.channel,
      browserSelection,
      completedResearchTabs,
      interruptionObservationId: interruption.observationId,
    });
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
    return asJsonValue({
      kind: "validate",
      runId: plan.runId,
      channelRunId: unfinished.channelRunId,
      channel: unfinished.channel,
      browserSelection,
      completedResearchTabs,
    });
  }
  return asJsonValue({
    kind: "record_observation",
    runId: plan.runId,
    channelRunId: unfinished.channelRunId,
    channel: unfinished.channel,
    browserSelection,
    completedResearchTabs,
  });
}

function assertBrowserCompatibility(
  channels: StoredPlan["channels"],
  selection: BrowserSelection,
  runId?: string,
): void {
  const incompatible = channels.filter(
    (channel) => !getPlaybook(channel).supportedBrowsers.codex.includes(selection.browser),
  );
  if (incompatible.length === 0) return;
  throw new ContractError("Selected browser is not supported for the active channel.", [{
    code: "browser_not_supported",
    message:
      `${selection.browser} cannot be used for: ${incompatible.join(", ")}. ` +
      "Choose Chrome or remove those channels before beginning research.",
    path: "$.browserSelection.browser",
  }], 2, runId);
}

function assertObservationUsesSelectedBrowser(
  observation: Observation,
  selection: BrowserSelection,
): void {
  if (observation.source.kind !== "browser_ui") return;
  if (observation.source.browser !== selection.browser) {
    throw new ContractError("Observation browser does not match the user-confirmed selection.", [{
      code: "browser_selection_mismatch",
      message:
        `Expected ${selection.browser}; received ${observation.source.browser}. ` +
        "Record a browser-selection amendment before switching browser surfaces.",
      path: "$.source.browser",
    }], 6, observation.runId);
  }
  if (selection.browser === "in_app" && observation.source.accessMode !== "public") {
    throw new ContractError("The Codex in-app Browser is limited to public research.", [{
      code: "in_app_requires_public_access",
      message: "Use accessMode public, or amend the run to Chrome for authenticated research.",
      path: "$.source.accessMode",
    }], 6, observation.runId);
  }
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
        completedResearchTabs: request.completedResearchTabs ?? "close",
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
      assertBrowserCompatibility([plan.channelRuns[0]!.channel], plan.browserSelection, runId);
      await store.createPlan(plan);
      return success("plan", asJsonValue({
        created: true,
        plan,
        effectiveBrowserSelection: plan.browserSelection,
        nextAction: nextAction(plan, [], [], []),
      }), runId);
    }

    const plan = await store.readPlan(args.runId);
    if (args.json) {
      const amendmentInput = parsePlanAmendment(await readJsonInput(args.json), args.runId);
      const amendment = { ...amendmentInput, createdAt: new Date().toISOString() };
      const [currentAmendments, observations, receiptChannelRunIds] = await Promise.all([
        store.readAmendments(args.runId),
        store.readObservations(args.runId),
        store.listReceiptChannelRunIds(args.runId),
      ]);
      const proposedAmendments = [...currentAmendments, amendment];
      const currentSelection = effectiveBrowserSelection(plan, currentAmendments);
      const proposedSelection = effectiveBrowserSelection(plan, proposedAmendments);
      assertBrowserCompatibility(
        plan.channelRuns
          .filter((item) => !receiptChannelRunIds.includes(item.channelRunId))
          .slice(0, 1)
          .map((item) => item.channel),
        proposedSelection,
        args.runId,
      );
      if (currentSelection.browser !== proposedSelection.browser) {
        const active = plan.channelRuns.find(
          (item) => !receiptChannelRunIds.includes(item.channelRunId),
        );
        const substantiveObservation = active && observations.find(
          (item) =>
            item.channelRunId === active.channelRunId &&
            item.kind !== "interruption",
        );
        if (substantiveObservation) {
          throw new ContractError("Browser selection is locked for the active channel.", [{
            code: "browser_selection_locked",
            message:
              "The browser may be changed before a channel starts or after an interruption, " +
              "but not after channel-native evidence has been recorded.",
            path: "$.changes.browserSelection.browser",
          }], 2, args.runId);
        }
      }
      const disposition = await store.appendAmendment(amendment);
      const amendments = await store.readAmendments(args.runId);
      return success("plan", asJsonValue({
        resumed: true,
        amendment: disposition,
        plan,
        amendments,
        effectiveBrowserSelection: effectiveBrowserSelection(plan, amendments),
        nextAction: nextAction(plan, amendments, observations, receiptChannelRunIds),
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
      effectiveBrowserSelection: effectiveBrowserSelection(plan, amendments),
      nextAction: nextAction(plan, amendments, observations, receiptChannelRunIds),
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
    const plan = await store.readPlan(args.runId);
    const amendments = await store.readAmendments(args.runId);
    const selection = effectiveBrowserSelection(plan, amendments);
    assertBrowserCompatibility([observation.source.channel], selection, args.runId);
    assertObservationUsesSelectedBrowser(observation, selection);
    const disposition = await store.appendObservation(observation);
    const [observations, receiptChannelRunIds] = await Promise.all([
      store.readObservations(args.runId),
      store.listReceiptChannelRunIds(args.runId),
    ]);
    return success("record-observation", asJsonValue({
      disposition,
      observationId: observation.observationId,
      effectiveBrowserSelection: selection,
      nextAction: nextAction(plan, amendments, observations, receiptChannelRunIds),
    }), args.runId);
  }

  return validateRun(store, args.runId, args.channelRunId);
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

async function validateRun(
  store: StateStore,
  runId: string,
  requestedChannelRunId?: string,
): Promise<CommandResult> {
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
    return success("validate", asJsonValue({
      status: "complete",
      receiptChannelRunIds,
      effectiveBrowserSelection: effectiveBrowserSelection(plan, amendments),
      nextAction: nextAction(plan, amendments, observations, receiptChannelRunIds),
    }), runId);
  }
  if (
    requestedChannelRunId !== undefined &&
    requestedChannelRunId !== channelRun.channelRunId
  ) {
    throw new ContractError("Invalid channel run selection.", [
      {
        code: "invalid_channel_run",
        message: `Expected the next unreceipted channel run ${channelRun.channelRunId}.`,
        path: "--channel-run",
      },
    ], 2, runId);
  }
  const channelObservations = observations.filter(
    (observation) => observation.channelRunId === channelRun.channelRunId,
  );
  const allModulesNotApplicable = channelRun.enabledModules.every(
    (moduleName) => !getChannelModulePolicy(channelRun.channel, moduleName).supported,
  );
  if (channelObservations.length === 0 && !allModulesNotApplicable) {
    return success("validate", asJsonValue({
      status: "incomplete",
      reason: "no_observations",
      effectiveBrowserSelection: effectiveBrowserSelection(plan, amendments),
      nextAction: nextAction(plan, amendments, observations, receiptChannelRunIds),
    }), runId, [], 3);
  }
  const interruption = latestUnresolvedInterruption(channelObservations, plan);
  if (interruption) {
    const exitCode = interruptionExit(interruption);
    if (exitCode === 5 && requestedChannelRunId === channelRun.channelRunId) {
      const validatedAt = new Date().toISOString();
      const receipt: CoreReceipt = {
        contractVersion: CONTRACT_VERSION,
        receiptVersion: "1.0",
        receiptId: `receipt_${digest({
          runId,
          channelRunId: channelRun.channelRunId,
          interruption,
          amendments,
        }).slice(0, 24)}`,
        runId,
        channelRunId: channelRun.channelRunId,
        planDigest: digest(plan),
        amendmentReferences: amendments.map((item) => item.amendmentId),
        channel: channelRun.channel,
        enabledModules: channelRun.enabledModules,
        createdAt: plan.createdAt,
        capturedAt: {
          first: channelObservations[0]!.capturedAt,
          last: interruption.capturedAt,
        },
        validatedAt,
        requestedLocale: plan.locale,
        observedLocale: {
          uiLocale: interruption.source.uiLocale,
          region: interruption.source.region,
          timezone: interruption.source.timezone,
        },
        browser: interruption.source.browser,
        accessMode: interruption.source.accessMode,
        personalizedSession: interruption.source.personalizedSession,
        evidenceTier: channelRun.evidenceTier,
        observationReferences: channelObservations.map((item) => item.observationId),
        status: "failed",
        warnings: [],
        failures: [{
          code: "platform_ui_change",
          message: "The native UI no longer matches the expected semantic checkpoints.",
        }],
        moduleResults: {},
      };
      const receiptPath = await store.writeReceipt(
        runId,
        channelRun.channelRunId,
        receipt,
      );
      await store.writeStatus({
        contractVersion: CONTRACT_VERSION,
        runId,
        state: "interrupted",
        updatedAt: validatedAt,
        latestReceipt: receiptPath,
      });
      const completedReceiptIds = [...receiptChannelRunIds, channelRun.channelRunId];
      return success("validate", asJsonValue({
        status: "failed",
        receipt,
        interruptionObservationId: interruption.observationId,
        resumable: false,
        finalizedForRunProgression: true,
        effectiveBrowserSelection: effectiveBrowserSelection(plan, amendments),
        nextAction: nextAction(plan, amendments, observations, completedReceiptIds),
      }), runId, [], exitCode);
    }
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
  const validatedAt = new Date().toISOString();
  const first = channelObservations[0];
  const last = channelObservations.at(-1);
  const receiptSource = latestSession?.source ?? last?.source;
  const selectedBrowser = effectiveBrowserSelection(plan, amendments).browser;
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
    capturedAt: {
      first: first?.capturedAt ?? validatedAt,
      last: last?.capturedAt ?? validatedAt,
    },
    validatedAt,
    requestedLocale: plan.locale,
    observedLocale: {
      uiLocale: receiptSource?.uiLocale ?? plan.locale.uiLocale,
      region: receiptSource?.region ?? plan.locale.region,
      timezone: receiptSource?.timezone ?? plan.locale.timezone,
    },
    browser: receiptSource?.browser ?? selectedBrowser,
    accessMode: receiptSource?.accessMode ??
      (getPlaybook(channelRun.channel).defaultAccess === "authenticated" ? "authenticated" : "public"),
    personalizedSession: receiptSource?.personalizedSession ?? false,
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
    effectiveBrowserSelection: effectiveBrowserSelection(plan, amendments),
    nextAction: nextAction(plan, amendments, observations, completedReceiptIds),
  }), runId, receipt.warnings);
}
