import { createHash } from "node:crypto";

const forbiddenKeys = /credential|cookie|token|password|account|username|email|raw.?dom|raw.?handle|target.?id|tab.?id|(?:^|_)url$|title|profile.?identifier|screenshot.?path|creative.?asset|private.?asset/i;
const targetLifecycleStates = new Set([
  "created",
  "authentication_handoff",
  "recreation_required",
  "released",
]);

const semanticDiagnostics = {
  facebook: {
    routes: {
      facebook_search: { expected: "facebook_native_search_entry", observed: "facebook_native_search_entry", targetMatched: true, ready: true },
      facebook_authenticated_shell: { expected: "facebook_native_search_entry", observed: "facebook_authenticated_navigation", targetMatched: true, ready: false },
      facebook_target_unavailable: { expected: "facebook_native_search_entry", observed: "target_unavailable", targetMatched: false, ready: false },
    },
  },
  instagram: {
    routes: {
      instagram_search: { expected: "instagram_native_search_entry", observed: "instagram_native_search_entry", targetMatched: true, ready: true },
      instagram_authenticated_shell: { expected: "instagram_native_search_entry", observed: "instagram_authenticated_navigation", targetMatched: true, ready: false },
      instagram_target_unavailable: { expected: "instagram_native_search_entry", observed: "target_unavailable", targetMatched: false, ready: false },
    },
  },
  linkedin: {
    routes: {
      linkedin_search: { expected: "linkedin_native_search_entry", observed: "linkedin_native_search_entry", targetMatched: true, ready: true },
      linkedin_authenticated_feed: { expected: "linkedin_native_search_entry", observed: "linkedin_authenticated_feed_navigation", targetMatched: true, ready: false },
      linkedin_target_unavailable: { expected: "linkedin_native_search_entry", observed: "target_unavailable", targetMatched: false, ready: false },
    },
  },
  pinterest: {
    routes: {
      pinterest_public_search: { expected: "pinterest_search_control", observed: "pinterest_search_control", targetMatched: true, ready: true },
      pinterest_personal_search: { expected: "pinterest_search_control", observed: "pinterest_search_control", targetMatched: true, ready: true },
      pinterest_business_hub: { expected: "pinterest_search_control", observed: "pinterest_business_hub", targetMatched: true, ready: false },
      pinterest_root_after_search_redirect: { expected: "pinterest_search_control", observed: "pinterest_root", targetMatched: true, ready: false },
    },
  },
};

const channelsRequiringSemanticDiagnostics = new Set(Object.keys(semanticDiagnostics));

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

function semanticDiagnostic(input) {
  const supplied = input.diagnostic ?? (
    input.routeClass || input.expectedLandmark || input.observedLandmark
      ? {
          routeClass: input.routeClass,
          expectedLandmark: input.expectedLandmark,
          observedLandmark: input.observedLandmark,
        }
      : null
  );
  if (!supplied) return null;
  const channelContract = semanticDiagnostics[input.channel];
  const routeContract = channelContract?.routes?.[supplied.routeClass];
  if (
    !routeContract ||
    supplied.expectedLandmark !== routeContract.expected ||
    supplied.observedLandmark !== routeContract.observed ||
    input.targetMatched !== routeContract.targetMatched
  ) {
    throw new Error("Invalid semantic diagnostic.");
  }
  return {
    targetMatched: input.targetMatched === true,
    routeClass: supplied.routeClass,
    expectedLandmark: supplied.expectedLandmark,
    observedLandmark: supplied.observedLandmark,
    ready: input.targetMatched === true && input.searchLandmark === true && routeContract.ready,
  };
}

function dedicatedTargetLifecycle(input) {
  if (input.targetLease === undefined) return null;
  const lease = input.targetLease;
  if (
    !lease ||
    lease.ownership !== "plugin_owned" ||
    !targetLifecycleStates.has(lease.lifecycle) ||
    typeof lease.leaseHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(lease.leaseHash)
  ) {
    throw new Error("Invalid sanitized dedicated-target lifecycle.");
  }
  return {
    ownership: lease.ownership,
    lifecycle: lease.lifecycle,
    leaseHash: lease.leaseHash,
  };
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
  const target = dedicatedTargetLifecycle(input);
  if (input.accessState === "authentication_required") {
    if (target && target.lifecycle !== "authentication_handoff") {
      return { status: "failed", reasonCode: "ui_change" };
    }
    return { status: "interrupted", reasonCode: "authentication_required" };
  }
  if (input.accessState === "challenge") {
    return { status: "interrupted", reasonCode: "challenge" };
  }
  if (!input.localeMatches) return { status: "interrupted", reasonCode: "locale_mismatch" };
  if (
    target &&
    target.lifecycle !== "released"
  ) {
    return { status: "failed", reasonCode: "ui_change" };
  }
  const diagnostic = semanticDiagnostic(input);
  if (
    !input.searchLandmark ||
    (channelsRequiringSemanticDiagnostics.has(input.channel) && !diagnostic) ||
    (diagnostic && !diagnostic.ready) ||
    (input.interactionAttempted && !input.interactionSucceeded) ||
    (input.interactionAttempted && !input.resultsLandmark && !input.explicitNativeEmpty)
  ) {
    return { status: "failed", reasonCode: "ui_change" };
  }
  if (input.explicitNativeEmpty && input.interactionAttempted && input.interactionSucceeded) {
    return { status: "pass", reasonCode: "native_empty" };
  }
  return { status: "pass" };
}

export function makeReceipt(input) {
  assertSanitized(input);
  if (input.accessClass === "authenticated" && input.screenshotCaptured === true) {
    throw new Error("Authenticated browser screenshots are prohibited.");
  }
  const diagnostic = semanticDiagnostic(input);
  const target = dedicatedTargetLifecycle(input);
  const classification = classifyChecklist(input);
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const screenshotDefault =
    input.accessClass !== "authenticated" && (
      classification.reasonCode === "authentication_required" ||
      classification.reasonCode === "challenge" ||
      classification.reasonCode === "ui_change"
    );
  const policyReason =
    input.accessClass === "authenticated"
      ? "authenticated_capture_prohibited"
      : classification.reasonCode === "ui_change"
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
    ...(diagnostic
      ? {
          diagnostic: {
            targetMatched: diagnostic.targetMatched,
            routeClass: diagnostic.routeClass,
            expectedLandmark: diagnostic.expectedLandmark,
            observedLandmark: diagnostic.observedLandmark,
          },
        }
      : {}),
    ...(target ? { dedicatedTarget: target } : {}),
  };
  assertSanitized(receiptBase);
  const receiptId = `acceptance_${createHash("sha256").update(JSON.stringify(receiptBase)).digest("hex").slice(0, 24)}`;
  return { ...receiptBase, receiptId };
}
