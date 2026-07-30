import { CHANNELS, CONTRACT_VERSION, EVIDENCE_TIERS, MODULES, ORCHESTRATION_MODES, ContractError, isRecord, requireString, } from "./common.js";
export const RUN_BROWSERS = ["chrome", "in_app"];
export function effectiveBrowserSelection(plan, amendments) {
    let selection = plan.browserSelection;
    for (const amendment of amendments) {
        const candidate = amendment.changes.browserSelection;
        if (isRecord(candidate))
            selection = candidate;
    }
    return selection;
}
function validateBrowserSelection(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ code: "invalid_object", message: "Expected a browser selection object.", path });
        return false;
    }
    enumValue(value.browser, RUN_BROWSERS, `${path}.browser`, issues);
    if (value.confirmedByUser !== true) {
        issues.push({
            code: "browser_selection_not_confirmed",
            message: "The user must explicitly confirm Chrome or the Codex in-app Browser before planning.",
            path: `${path}.confirmedByUser`,
        });
    }
    return issues.every((issue) => !issue.path?.startsWith(path));
}
function enumValue(value, allowed, path, issues) {
    if (typeof value !== "string" || !allowed.includes(value)) {
        issues.push({
            code: "invalid_enum",
            message: `Expected one of: ${allowed.join(", ")}.`,
            path,
        });
        return false;
    }
    return true;
}
export function parsePlanRequest(value) {
    const issues = [];
    if (!isRecord(value)) {
        throw new ContractError("Invalid plan request.", [
            { code: "invalid_object", message: "Expected a JSON object.", path: "$" },
        ]);
    }
    if (value.contractVersion !== CONTRACT_VERSION) {
        issues.push({
            code: "unsupported_contract_version",
            message: `Expected contractVersion ${CONTRACT_VERSION}.`,
            path: "$.contractVersion",
        });
    }
    if (!isRecord(value.creativeBrief)) {
        issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.creativeBrief" });
    }
    else {
        requireString(value.creativeBrief.summary, "$.creativeBrief.summary", issues);
    }
    if (!Array.isArray(value.inputReferences) || !value.inputReferences.every((item) => typeof item === "string")) {
        issues.push({
            code: "invalid_string_array",
            message: "Expected an array of safe input references.",
            path: "$.inputReferences",
        });
    }
    if (!Array.isArray(value.channels) ||
        value.channels.length === 0 ||
        !value.channels.every((item) => typeof item === "string" && CHANNELS.includes(item)) ||
        new Set(value.channels).size !== value.channels.length) {
        issues.push({
            code: "invalid_channels",
            message: "Expected a non-empty ordered list of unique supported channels.",
            path: "$.channels",
        });
    }
    if (!isRecord(value.locale)) {
        issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.locale" });
    }
    else {
        requireString(value.locale.uiLocale, "$.locale.uiLocale", issues);
        requireString(value.locale.region, "$.locale.region", issues);
        requireString(value.locale.timezone, "$.locale.timezone", issues);
    }
    enumValue(value.orchestrationMode, ORCHESTRATION_MODES, "$.orchestrationMode", issues);
    if (!Array.isArray(value.enabledModules) ||
        value.enabledModules.length === 0 ||
        !value.enabledModules.every((item) => typeof item === "string" && MODULES.includes(item)) ||
        new Set(value.enabledModules).size !== value.enabledModules.length) {
        issues.push({
            code: "invalid_modules",
            message: "Expected a non-empty list of unique supported modules.",
            path: "$.enabledModules",
        });
    }
    enumValue(value.defaultEvidenceTier, EVIDENCE_TIERS, "$.defaultEvidenceTier", issues);
    validateBrowserSelection(value.browserSelection, "$.browserSelection", issues);
    if (!isRecord(value.interactionBounds)) {
        issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.interactionBounds" });
    }
    else {
        for (const field of ["maxPrefixesPerModule", "maxSuggestionsPerPrefix", "maxResultsPerCandidate"]) {
            const bound = value.interactionBounds[field];
            if (!Number.isInteger(bound) || bound < 1) {
                issues.push({
                    code: "invalid_bound",
                    message: "Expected a positive integer.",
                    path: `$.interactionBounds.${field}`,
                });
            }
        }
        if (value.interactionBounds.maxRefinementRounds !== 1) {
            issues.push({
                code: "invalid_refinement_bound",
                message: "Version 1 requires exactly one bounded refinement round.",
                path: "$.interactionBounds.maxRefinementRounds",
            });
        }
    }
    if (value.runId !== undefined && !/^run_[A-Za-z0-9_-]+$/.test(String(value.runId))) {
        issues.push({ code: "invalid_run_id", message: "Expected run_<id>.", path: "$.runId" });
    }
    if (issues.length > 0) {
        throw new ContractError("Invalid plan request.", issues);
    }
    return value;
}
export function parsePlanAmendment(value, runId) {
    const issues = [];
    if (!isRecord(value)) {
        throw new ContractError("Invalid plan amendment.", [
            { code: "invalid_object", message: "Expected a JSON object.", path: "$" },
        ], 2, runId);
    }
    if (value.contractVersion !== CONTRACT_VERSION) {
        issues.push({
            code: "unsupported_contract_version",
            message: `Expected contractVersion ${CONTRACT_VERSION}.`,
            path: "$.contractVersion",
        });
    }
    requireString(value.amendmentId, "$.amendmentId", issues);
    requireString(value.reason, "$.reason", issues);
    if (value.runId !== runId) {
        issues.push({ code: "run_id_mismatch", message: "Amendment runId does not match --run.", path: "$.runId" });
    }
    if (!isRecord(value.changes)) {
        issues.push({ code: "invalid_object", message: "Expected an object.", path: "$.changes" });
    }
    else if (value.changes.browserSelection !== undefined) {
        validateBrowserSelection(value.changes.browserSelection, "$.changes.browserSelection", issues);
    }
    if (issues.length > 0) {
        throw new ContractError("Invalid plan amendment.", issues, 2, runId);
    }
    return value;
}
//# sourceMappingURL=plan.js.map