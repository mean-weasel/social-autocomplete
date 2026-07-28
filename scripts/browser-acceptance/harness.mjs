import { createHash } from "node:crypto";

const forbiddenKeys = /credential|cookie|token|password|account|username|email|raw.?dom|screenshot.?path|creative.?asset|private.?asset/i;

export function assertSanitized(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSanitized(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) throw new Error(`Forbidden private field at ${path}.${key}`);
    assertSanitized(child, `${path}.${key}`);
  }
}

export function classifyChecklist(input) {
  if (input.channel === "pinterest" && input.module === "hashtag") {
    return { status: "not_applicable", reasonCode: "pinterest_hashtag_not_applicable" };
  }
  if (input.host === "claude" && input.browser !== "chrome") {
    return { status: "interrupted", reasonCode: "capability_unavailable" };
  }
  if (input.accessClass === "public" && input.host === "claude") {
    return { status: "interrupted", reasonCode: "capability_unavailable" };
  }
  if (input.accessState === "authentication_required") {
    return { status: "interrupted", reasonCode: "authentication_required" };
  }
  if (input.accessState === "challenge") {
    return { status: "interrupted", reasonCode: "challenge" };
  }
  if (!input.localeMatches) return { status: "interrupted", reasonCode: "locale_mismatch" };
  if (!input.searchLandmark || !input.resultsLandmark || (input.interactionAttempted && !input.interactionSucceeded)) {
    return { status: "failed", reasonCode: "ui_change" };
  }
  if (input.explicitNativeEmpty && input.interactionAttempted && input.interactionSucceeded) {
    return { status: "pass", reasonCode: "native_empty" };
  }
  return { status: "pass" };
}

export function makeReceipt(input) {
  assertSanitized(input);
  const classification = classifyChecklist(input);
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const screenshotDefault =
    classification.reasonCode === "authentication_required" ||
    classification.reasonCode === "challenge" ||
    classification.reasonCode === "ui_change";
  const policyReason =
    classification.reasonCode === "ui_change"
      ? "ui_change"
      : classification.reasonCode === "authentication_required" || classification.reasonCode === "challenge"
        ? "authentication_or_challenge"
        : "not_needed";
  const receiptBase = {
    contractVersion: "1.0",
    receiptVersion: "1.0",
    capturedAt,
    host: input.host,
    browser: input.browser,
    channel: input.channel,
    module: input.module,
    accessClass: input.accessClass,
    locale: input.locale,
    status: classification.status,
    ...(classification.reasonCode ? { reasonCode: classification.reasonCode } : {}),
    checkpoints: [
      { id: "channel", status: "present" },
      { id: "search", status: input.searchLandmark ? "present" : "missing" },
      { id: "results", status: input.resultsLandmark ? "present" : "missing" },
    ],
    interaction: {
      attempted: input.interactionAttempted,
      succeeded: input.interactionSucceeded,
      explicitNativeEmpty: input.explicitNativeEmpty,
    },
    screenshot: {
      captured: input.screenshotCaptured ?? screenshotDefault,
      policyReason,
    },
  };
  assertSanitized(receiptBase);
  const receiptId = `acceptance_${createHash("sha256").update(JSON.stringify(receiptBase)).digest("hex").slice(0, 24)}`;
  return { ...receiptBase, receiptId };
}
