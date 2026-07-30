import { asJsonValue, CONTRACT_VERSION, ContractError, effectiveBrowserSelection, parseObservation, parsePlanAmendment, parsePlanRequest, } from "../contracts/index.js";
import { getPlaybook } from "../channels/index.js";
import { getChannelModulePolicy } from "../channels/policies/index.js";
import { parseModuleObservationPayload, reduceChannelModules, } from "../modules/registry.js";
import { createId, digest, StateStore } from "../state/store.js";
import { readJsonInput } from "./arguments.js";
function success(command, data, runId, warnings = [], exitCode = 0) {
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
function latestUnresolvedInterruption(observations, plan) {
    const interruption = observations.findLast((item) => item.kind === "interruption");
    if (!interruption)
        return undefined;
    const index = observations.indexOf(interruption);
    const later = observations.slice(index + 1);
    const payload = typeof interruption.payload === "object" && interruption.payload !== null
        ? interruption.payload
        : {};
    const laterSession = later.findLast((item) => item.kind === "session_state" && item.source.kind === "browser_ui");
    if (!laterSession)
        return interruption;
    if (payload.reason === "locale_mismatch" || payload.reason === "environment_mismatch") {
        const localeMatches = laterSession.source.uiLocale === plan.locale.uiLocale &&
            laterSession.source.region === plan.locale.region &&
            laterSession.source.timezone === plan.locale.timezone;
        return localeMatches ? undefined : interruption;
    }
    if (payload.reason !== "ui_change")
        return undefined;
    const restored = later.some((item) => {
        if (item.kind !== "diagnostic" || typeof item.payload !== "object" || item.payload === null) {
            return false;
        }
        const diagnostic = item.payload;
        return diagnostic.resolution === "assisted_resume" && diagnostic.checkpointsRestored === true;
    });
    return restored ? undefined : interruption;
}
function nextAction(plan, amendments, observations, receiptChannelRunIds) {
    const browserSelection = effectiveBrowserSelection(plan, amendments);
    const unfinished = plan.channelRuns.find((channelRun) => !receiptChannelRunIds.includes(channelRun.channelRunId));
    if (!unfinished)
        return asJsonValue({ kind: "complete", runId: plan.runId, browserSelection });
    const allowedBrowsers = getPlaybook(unfinished.channel).supportedBrowsers.codex;
    if (!allowedBrowsers.includes(browserSelection.browser)) {
        return asJsonValue({
            kind: "amend_browser_selection",
            runId: plan.runId,
            channelRunId: unfinished.channelRunId,
            channel: unfinished.channel,
            browserSelection,
            allowedBrowsers,
        });
    }
    const channelObservations = observations.filter((observation) => observation.channelRunId === unfinished.channelRunId);
    const interruption = latestUnresolvedInterruption(channelObservations, plan);
    if (interruption) {
        return asJsonValue({
            kind: "resume_interruption",
            runId: plan.runId,
            channelRunId: unfinished.channelRunId,
            channel: unfinished.channel,
            browserSelection,
            interruptionObservationId: interruption.observationId,
        });
    }
    const decisionsComplete = unfinished.enabledModules.every((moduleName) => {
        if (!getChannelModulePolicy(unfinished.channel, moduleName).supported)
            return true;
        return channelObservations.some((observation) => observation.module.name === moduleName &&
            observation.kind === "recommendation_decision");
    });
    if (decisionsComplete) {
        return asJsonValue({
            kind: "validate",
            runId: plan.runId,
            channelRunId: unfinished.channelRunId,
            channel: unfinished.channel,
            browserSelection,
        });
    }
    return asJsonValue({
        kind: "record_observation",
        runId: plan.runId,
        channelRunId: unfinished.channelRunId,
        channel: unfinished.channel,
        browserSelection,
    });
}
function assertBrowserCompatibility(channels, selection, runId) {
    const incompatible = channels.filter((channel) => !getPlaybook(channel).supportedBrowsers.codex.includes(selection.browser));
    if (incompatible.length === 0)
        return;
    throw new ContractError("Selected browser is not supported for the active channel.", [{
            code: "browser_not_supported",
            message: `${selection.browser} cannot be used for: ${incompatible.join(", ")}. ` +
                "Choose Chrome or remove those channels before beginning research.",
            path: "$.browserSelection.browser",
        }], 2, runId);
}
function assertObservationUsesSelectedBrowser(observation, selection) {
    if (observation.source.kind !== "browser_ui")
        return;
    if (observation.source.browser !== selection.browser) {
        throw new ContractError("Observation browser does not match the user-confirmed selection.", [{
                code: "browser_selection_mismatch",
                message: `Expected ${selection.browser}; received ${observation.source.browser}. ` +
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
export async function executeCommand(args, cwd) {
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
            const plan = {
                ...request,
                runId,
                createdAt,
                channelRuns: request.channels.map((channel) => ({
                    channelRunId: createId("channel"),
                    channel,
                    enabledModules: request.enabledModules,
                    evidenceTier: request.channelOverrides?.[channel]?.evidenceTier ?? request.defaultEvidenceTier,
                })),
            };
            assertBrowserCompatibility([plan.channelRuns[0].channel], plan.browserSelection, runId);
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
            assertBrowserCompatibility(plan.channelRuns
                .filter((item) => !receiptChannelRunIds.includes(item.channelRunId))
                .slice(0, 1)
                .map((item) => item.channel), proposedSelection, args.runId);
            if (currentSelection.browser !== proposedSelection.browser) {
                const active = plan.channelRuns.find((item) => !receiptChannelRunIds.includes(item.channelRunId));
                const substantiveObservation = active && observations.find((item) => item.channelRunId === active.channelRunId &&
                    item.kind !== "interruption");
                if (substantiveObservation) {
                    throw new ContractError("Browser selection is locked for the active channel.", [{
                            code: "browser_selection_locked",
                            message: "The browser may be changed before a channel starts or after an interruption, " +
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
function interruptionExit(observation) {
    const payload = typeof observation.payload === "object" && observation.payload !== null
        ? observation.payload
        : {};
    const reason = payload.reason;
    if (reason === "ui_change")
        return 5;
    if (reason === "locale_mismatch" || reason === "environment_mismatch")
        return 6;
    return 4;
}
async function validateRun(store, runId, requestedChannelRunId) {
    const plan = await store.readPlan(runId);
    const [amendments, observations, receiptChannelRunIds] = await Promise.all([
        store.readAmendments(runId),
        store.readObservations(runId),
        store.listReceiptChannelRunIds(runId),
    ]);
    const channelRun = plan.channelRuns.find((item) => !receiptChannelRunIds.includes(item.channelRunId));
    if (!channelRun) {
        return success("validate", asJsonValue({
            status: "complete",
            receiptChannelRunIds,
            effectiveBrowserSelection: effectiveBrowserSelection(plan, amendments),
            nextAction: nextAction(plan, amendments, observations, receiptChannelRunIds),
        }), runId);
    }
    if (requestedChannelRunId !== undefined &&
        requestedChannelRunId !== channelRun.channelRunId) {
        throw new ContractError("Invalid channel run selection.", [
            {
                code: "invalid_channel_run",
                message: `Expected the next unreceipted channel run ${channelRun.channelRunId}.`,
                path: "--channel-run",
            },
        ], 2, runId);
    }
    const channelObservations = observations.filter((observation) => observation.channelRunId === channelRun.channelRunId);
    if (channelObservations.length === 0) {
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
            const receipt = {
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
                    first: channelObservations[0].capturedAt,
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
            const receiptPath = await store.writeReceipt(runId, channelRun.channelRunId, receipt);
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
    const latestSession = channelObservations.findLast((observation) => observation.kind === "session_state" &&
        observation.source.kind === "browser_ui");
    if (latestSession &&
        (latestSession.source.uiLocale !== plan.locale.uiLocale ||
            latestSession.source.region !== plan.locale.region ||
            latestSession.source.timezone !== plan.locale.timezone)) {
        return success("validate", {
            status: "interrupted",
            reason: "locale_or_environment_mismatch",
            sessionObservationId: latestSession.observationId,
            resumable: true,
        }, runId, [], 6);
    }
    const first = channelObservations[0];
    const last = channelObservations.at(-1);
    const validatedAt = new Date().toISOString();
    const moduleReduction = reduceChannelModules(plan, amendments, observations, channelRun.channelRunId, validatedAt);
    if (!moduleReduction.complete) {
        return success("validate", asJsonValue({
            status: "incomplete",
            reason: "module_evidence_invalid",
            moduleResults: moduleReduction.moduleResults,
        }), runId, [], 3);
    }
    const receipt = {
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
        moduleResults: Object.fromEntries(moduleReduction.moduleResults.map((item) => [item.module, asJsonValue(item)])),
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
//# sourceMappingURL=commands.js.map