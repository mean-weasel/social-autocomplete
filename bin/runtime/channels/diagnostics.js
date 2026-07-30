function result(snapshot, classification) {
    return snapshot.diagnostic
        ? { ...classification, diagnostic: snapshot.diagnostic }
        : classification;
}
const semanticSearchContracts = {
    facebook_search: {
        expectedLandmark: "facebook_native_search_entry",
        observedLandmark: "facebook_native_search_entry",
        targetMatched: true,
        readyRoute: true,
    },
    facebook_authenticated_shell: {
        expectedLandmark: "facebook_native_search_entry",
        observedLandmark: "facebook_authenticated_navigation",
        targetMatched: true,
        readyRoute: false,
    },
    facebook_target_unavailable: {
        expectedLandmark: "facebook_native_search_entry",
        observedLandmark: "target_unavailable",
        targetMatched: false,
        readyRoute: false,
    },
    instagram_search: {
        expectedLandmark: "instagram_native_search_entry",
        observedLandmark: "instagram_native_search_entry",
        targetMatched: true,
        readyRoute: true,
    },
    instagram_authenticated_shell: {
        expectedLandmark: "instagram_native_search_entry",
        observedLandmark: "instagram_authenticated_navigation",
        targetMatched: true,
        readyRoute: false,
    },
    instagram_target_unavailable: {
        expectedLandmark: "instagram_native_search_entry",
        observedLandmark: "target_unavailable",
        targetMatched: false,
        readyRoute: false,
    },
    linkedin_search: {
        expectedLandmark: "linkedin_native_search_entry",
        observedLandmark: "linkedin_native_search_entry",
        targetMatched: true,
        readyRoute: true,
    },
    linkedin_authenticated_feed: {
        expectedLandmark: "linkedin_native_search_entry",
        observedLandmark: "linkedin_authenticated_feed_navigation",
        targetMatched: true,
        readyRoute: false,
    },
    linkedin_target_unavailable: {
        expectedLandmark: "linkedin_native_search_entry",
        observedLandmark: "target_unavailable",
        targetMatched: false,
        readyRoute: false,
    },
    pinterest_public_search: {
        expectedLandmark: "pinterest_search_control",
        observedLandmark: "pinterest_search_control",
        targetMatched: true,
        readyRoute: true,
    },
    pinterest_personal_search: {
        expectedLandmark: "pinterest_search_control",
        observedLandmark: "pinterest_search_control",
        targetMatched: true,
        readyRoute: true,
    },
    pinterest_business_hub: {
        expectedLandmark: "pinterest_search_control",
        observedLandmark: "pinterest_business_hub",
        targetMatched: true,
        readyRoute: false,
    },
    pinterest_root_after_search_redirect: {
        expectedLandmark: "pinterest_search_control",
        observedLandmark: "pinterest_root",
        targetMatched: true,
        readyRoute: false,
    },
};
function semanticSearchEntryMissing(snapshot) {
    const diagnostic = snapshot.diagnostic;
    if (!diagnostic || diagnostic.routeClass === "generic")
        return false;
    const contract = semanticSearchContracts[diagnostic.routeClass];
    if (!contract)
        return true;
    return (snapshot.targetMatched !== contract.targetMatched ||
        snapshot.searchEntryPresent !== true ||
        !contract.readyRoute ||
        diagnostic.expectedLandmark !== contract.expectedLandmark ||
        diagnostic.observedLandmark !== contract.observedLandmark);
}
export function classifySurface(snapshot) {
    if (snapshot.accessState === "authentication_required") {
        return result(snapshot, { state: "interrupted", reasonCode: "authentication_required", exitCode: 4 });
    }
    if (snapshot.accessState === "challenge") {
        return result(snapshot, { state: "interrupted", reasonCode: "challenge", exitCode: 4 });
    }
    if (!snapshot.localeMatches) {
        return result(snapshot, { state: "interrupted", reasonCode: "locale_mismatch", exitCode: 6 });
    }
    if (semanticSearchEntryMissing(snapshot) ||
        !snapshot.expectedLandmarksPresent ||
        (snapshot.interactionAttempted && !snapshot.interactionSucceeded)) {
        return result(snapshot, { state: "failed", reasonCode: "ui_change", exitCode: 5 });
    }
    if (snapshot.explicitNativeEmpty && snapshot.interactionAttempted && snapshot.interactionSucceeded) {
        return result(snapshot, { state: "native_empty", exitCode: 0 });
    }
    return result(snapshot, { state: "ready", exitCode: 0 });
}
//# sourceMappingURL=diagnostics.js.map