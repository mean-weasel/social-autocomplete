export const CONTRACT_VERSION = "1.0";
export const CHANNELS = [
    "facebook",
    "instagram",
    "linkedin",
    "x",
    "tiktok",
    "youtube",
    "pinterest",
];
export const MODULES = ["search-term", "hashtag"];
export const EVIDENCE_TIERS = ["autocomplete_only", "results_sample"];
export const ORCHESTRATION_MODES = ["guided", "automatic"];
export class ContractError extends Error {
    issues;
    exitCode;
    runId;
    constructor(message, issues, exitCode = 2, runId) {
        super(message);
        this.name = "ContractError";
        this.issues = issues;
        this.exitCode = exitCode;
        this.runId = runId;
    }
}
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function requireString(value, path, issues) {
    if (typeof value !== "string" || value.trim() === "") {
        issues.push({ code: "invalid_string", message: "Expected a non-empty string.", path });
        return false;
    }
    return true;
}
export function requireStringArray(value, path, issues) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        issues.push({ code: "invalid_string_array", message: "Expected an array of strings.", path });
        return false;
    }
    return true;
}
export function isIsoTimestamp(value) {
    return !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}
export function asJsonValue(value) {
    return value;
}
//# sourceMappingURL=common.js.map