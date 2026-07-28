import type {
  SurfaceClassification,
  SurfaceSnapshot,
} from "./types.js";

export function classifySurface(snapshot: SurfaceSnapshot): SurfaceClassification {
  if (snapshot.accessState === "authentication_required") {
    return { state: "interrupted", reasonCode: "authentication_required", exitCode: 4 };
  }
  if (snapshot.accessState === "challenge") {
    return { state: "interrupted", reasonCode: "challenge", exitCode: 4 };
  }
  if (!snapshot.localeMatches) {
    return { state: "interrupted", reasonCode: "locale_mismatch", exitCode: 6 };
  }
  if (!snapshot.expectedLandmarksPresent || (snapshot.interactionAttempted && !snapshot.interactionSucceeded)) {
    return { state: "failed", reasonCode: "ui_change", exitCode: 5 };
  }
  if (snapshot.explicitNativeEmpty && snapshot.interactionAttempted && snapshot.interactionSucceeded) {
    return { state: "native_empty", exitCode: 0 };
  }
  return { state: "ready", exitCode: 0 };
}
