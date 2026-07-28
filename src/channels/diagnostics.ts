import type {
  SurfaceClassification,
  SurfaceSnapshot,
} from "./types.js";

function result(
  snapshot: SurfaceSnapshot,
  classification: Omit<SurfaceClassification, "diagnostic">,
): SurfaceClassification {
  return snapshot.diagnostic
    ? { ...classification, diagnostic: snapshot.diagnostic }
    : classification;
}

function semanticSearchEntryMissing(snapshot: SurfaceSnapshot): boolean {
  const diagnostic = snapshot.diagnostic;
  if (!diagnostic || diagnostic.routeClass === "generic") return false;

  const isLinkedIn = diagnostic.routeClass.startsWith("linkedin_");
  const expectedLandmark = isLinkedIn
    ? "linkedin_native_search_entry"
    : "pinterest_search_control";
  const observedLandmark = isLinkedIn
    ? "linkedin_native_search_entry"
    : "pinterest_search_control";

  return (
    snapshot.searchEntryPresent !== true ||
    diagnostic.expectedLandmark !== expectedLandmark ||
    diagnostic.observedLandmark !== observedLandmark
  );
}

export function classifySurface(snapshot: SurfaceSnapshot): SurfaceClassification {
  if (snapshot.accessState === "authentication_required") {
    return result(snapshot, { state: "interrupted", reasonCode: "authentication_required", exitCode: 4 });
  }
  if (snapshot.accessState === "challenge") {
    return result(snapshot, { state: "interrupted", reasonCode: "challenge", exitCode: 4 });
  }
  if (!snapshot.localeMatches) {
    return result(snapshot, { state: "interrupted", reasonCode: "locale_mismatch", exitCode: 6 });
  }
  if (
    semanticSearchEntryMissing(snapshot) ||
    !snapshot.expectedLandmarksPresent ||
    (snapshot.interactionAttempted && !snapshot.interactionSucceeded)
  ) {
    return result(snapshot, { state: "failed", reasonCode: "ui_change", exitCode: 5 });
  }
  if (snapshot.explicitNativeEmpty && snapshot.interactionAttempted && snapshot.interactionSucceeded) {
    return result(snapshot, { state: "native_empty", exitCode: 0 });
  }
  return result(snapshot, { state: "ready", exitCode: 0 });
}
