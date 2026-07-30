function canonicalize(moduleName, value) {
    const collapsed = value.trim().replace(/\s+/gu, " ");
    return moduleName === "hashtag" ? collapsed.toLocaleLowerCase() : collapsed;
}
function issue(code, message, path) {
    return { code, message, ...(path ? { path } : {}) };
}
function qualifiesResultSample(payload) {
    const relevant = payload.results.filter((item) => item.relevance === "relevant").length;
    if (payload.results.length === 3)
        return relevant >= 2;
    return payload.results.length === 2 && payload.surfaceExhausted && relevant === 2;
}
function referencedObservation(observations, id, kind) {
    return observations.find((item) => item.observationId === id && item.kind === kind);
}
function isFresh(observation, validatedAt) {
    const age = Date.parse(validatedAt) - Date.parse(observation.capturedAt);
    return age >= 0 && age <= 24 * 60 * 60 * 1000;
}
function interruptionIsResolved(allObservations, interruption) {
    const index = allObservations.indexOf(interruption);
    const later = allObservations.slice(index + 1);
    const payload = typeof interruption.payload === "object" && interruption.payload !== null
        ? interruption.payload
        : {};
    const laterSession = later.find((item) => item.kind === "session_state" && item.source.kind === "browser_ui");
    if (!laterSession)
        return false;
    if (payload.reason !== "ui_change")
        return true;
    return later.some((item) => {
        if (item.kind !== "diagnostic" || typeof item.payload !== "object" || item.payload === null) {
            return false;
        }
        const diagnostic = item.payload;
        return diagnostic.resolution === "assisted_resume" && diagnostic.checkpointsRestored === true;
    });
}
export function reduceModule(input) {
    const base = {
        module: input.moduleName,
        schemaVersion: "1.0",
        outcome: "failed",
        evidenceTier: input.evidenceTier,
        recommendationRange: input.recommendationRange,
        attemptedPrefixes: [],
        researchedRecommendations: [],
        rejectedCandidates: [],
        modelSuggestions: [],
        evidenceReferences: [],
        warnings: [],
        failures: [],
    };
    if (!input.supported) {
        return {
            ...base,
            outcome: "not_applicable",
            notApplicableReason: input.notApplicableReason ?? "module_not_supported",
        };
    }
    const observations = input.observations.filter((item) => item.module.name === input.moduleName);
    const interruption = input.observations.findLast((item) => item.kind === "interruption");
    if (interruption && !interruptionIsResolved(input.observations, interruption)) {
        const payload = typeof interruption.payload === "object" && interruption.payload !== null
            ? interruption.payload
            : {};
        const uiChange = payload.reason === "ui_change";
        return {
            ...base,
            outcome: uiChange ? "failed" : "interrupted",
            evidenceReferences: [interruption.observationId],
            failures: uiChange
                ? [issue("platform_ui_change", "The native UI no longer matches the expected semantic checkpoints.")]
                : [],
        };
    }
    const session = input.observations.findLast((item) => item.kind === "session_state" && item.source.kind === "browser_ui");
    if (!session) {
        base.failures.push(issue("missing_session_state", "Current channel-native session evidence is required."));
    }
    else if (!isFresh(session, input.validatedAt)) {
        base.failures.push(issue("stale_evidence", "Session evidence is older than 24 hours."));
    }
    else {
        base.evidenceReferences.push(session.observationId);
    }
    const suggestionSets = observations.filter((item) => item.kind === "suggestion_set");
    for (const observation of suggestionSets) {
        const payload = observation.payload;
        if (observation.source.kind !== "browser_ui")
            continue;
        const typedText = observation.query?.typedText;
        if (!typedText) {
            base.failures.push(issue("missing_typed_prefix", "Suggestion evidence must retain the exact typed prefix.", observation.observationId));
            continue;
        }
        base.attemptedPrefixes.push({
            typedText,
            round: payload.round ?? 0,
            observationId: observation.observationId,
        });
        if (!isFresh(observation, input.validatedAt)) {
            base.failures.push(issue("stale_evidence", "Suggestion evidence is older than 24 hours.", observation.observationId));
        }
        if (session && observation.source.accessMode !== session.source.accessMode) {
            base.failures.push(issue("mixed_access_modes", "Public and authenticated browser observations cannot be silently combined.", observation.observationId));
        }
        if (payload.suggestions.length > input.bounds.maxSuggestionsPerPrefix) {
            base.failures.push(issue("suggestion_bound_exceeded", `At most ${input.bounds.maxSuggestionsPerPrefix} visible suggestions may be captured per prefix.`, observation.observationId));
        }
    }
    if (suggestionSets.length > 0) {
        base.warnings.push(issue("autocomplete_position_not_performance", "Autocomplete display order is observational only and is not popularity or performance proof."));
    }
    const attemptedInitial = new Set(base.attemptedPrefixes.filter((item) => item.round === 0).map((item) => item.typedText));
    const attemptedRefinement = new Set(base.attemptedPrefixes.filter((item) => item.round === 1).map((item) => item.typedText));
    if (input.plannedPrefixes.initial.length === 0) {
        base.failures.push(issue("missing_planned_prefixes", "Every supported module requires recorded exact initial prefixes."));
    }
    if (input.plannedPrefixes.initial.length > input.bounds.maxInitialPrefixes ||
        attemptedInitial.size > input.bounds.maxInitialPrefixes) {
        base.failures.push(issue("initial_prefix_bound_exceeded", "The initial prefix bound was exceeded."));
    }
    if (input.plannedPrefixes.refinement.length > input.bounds.maxRevisedPrefixes ||
        attemptedRefinement.size > input.bounds.maxRevisedPrefixes) {
        base.failures.push(issue("refinement_prefix_bound_exceeded", "The revised-prefix bound was exceeded."));
    }
    const missingInitial = input.plannedPrefixes.initial.filter((prefix) => !attemptedInitial.has(prefix));
    const missingRefinement = input.plannedPrefixes.refinement.filter((prefix) => !attemptedRefinement.has(prefix));
    if (missingInitial.length > 0 || missingRefinement.length > 0) {
        base.failures.push(issue("unattempted_planned_prefixes", "Every current planned prefix must be attempted before the module can complete."));
    }
    const decisions = observations.filter((item) => item.kind === "recommendation_decision");
    const zeroDecisions = [];
    const seenSelected = new Set();
    for (const observation of decisions) {
        const payload = observation.payload;
        if (payload.decision === "zero") {
            zeroDecisions.push({ observation, payload });
            continue;
        }
        if (payload.origin === "model") {
            base.modelSuggestions.push({
                displayedValue: payload.candidate,
                rationale: payload.rationale,
            });
            base.warnings.push(issue("model_suggestion_excluded", "A model-inferred candidate was excluded from researched recommendations.", observation.observationId));
            continue;
        }
        const suggestionEvidence = payload.suggestionEvidenceIds
            .map((id) => referencedObservation(observations, id, "suggestion_set"))
            .filter((item) => item !== undefined);
        const nativeExactMatch = suggestionEvidence.some((evidence) => evidence.source.kind === "browser_ui" &&
            evidence.payload.suggestions.some((suggestion) => suggestion.displayedValue === payload.candidate));
        const candidateFailures = [];
        if (suggestionEvidence.length !== payload.suggestionEvidenceIds.length || !nativeExactMatch) {
            candidateFailures.push(issue("missing_exact_suggestion_evidence", "A researched candidate must exactly match a captured native suggestion.", observation.observationId));
        }
        const nativeSuggestionEvidence = suggestionEvidence.filter((item) => item.source.kind === "browser_ui");
        if (nativeSuggestionEvidence.some((item) => !isFresh(item, input.validatedAt))) {
            candidateFailures.push(issue("stale_evidence", "Referenced suggestion evidence is older than 24 hours.", observation.observationId));
        }
        if (session && nativeSuggestionEvidence.some((item) => item.source.accessMode !== session.source.accessMode)) {
            candidateFailures.push(issue("mixed_access_modes", "Referenced browser evidence must use the session access mode.", observation.observationId));
        }
        const resultEvidence = payload.resultEvidenceIds
            .map((id) => referencedObservation(observations, id, "result_sample"))
            .filter((item) => item !== undefined);
        if (resultEvidence.length !== payload.resultEvidenceIds.length) {
            candidateFailures.push(issue("missing_result_evidence", "Every result evidence reference must resolve within the same channel run.", observation.observationId));
        }
        const nativeResultEvidence = resultEvidence.filter((item) => item.source.kind === "browser_ui");
        if (nativeResultEvidence.some((item) => !isFresh(item, input.validatedAt))) {
            candidateFailures.push(issue("stale_result_evidence", "Referenced result evidence is older than 24 hours.", observation.observationId));
        }
        if (session && nativeResultEvidence.some((item) => item.source.accessMode !== session.source.accessMode)) {
            candidateFailures.push(issue("mixed_access_modes", "Result samples must use the same browser access mode as the native session.", observation.observationId));
        }
        if (nativeResultEvidence.some((item) => item.payload.results.length > input.bounds.maxResultsPerCandidate)) {
            candidateFailures.push(issue("result_bound_exceeded", `At most ${input.bounds.maxResultsPerCandidate} results may be inspected per candidate.`, observation.observationId));
        }
        if (input.evidenceTier === "results_sample" && payload.decision === "selected") {
            const qualifying = resultEvidence.some((evidence) => {
                const resultPayload = evidence.payload;
                return evidence.source.kind === "browser_ui" &&
                    isFresh(evidence, input.validatedAt) &&
                    (!session || evidence.source.accessMode === session.source.accessMode) &&
                    resultPayload.results.length <= input.bounds.maxResultsPerCandidate &&
                    resultPayload.candidate === payload.candidate &&
                    qualifiesResultSample(resultPayload);
            });
            if (!qualifying) {
                candidateFailures.push(issue("insufficient_result_relevance", "Every intended recommendation requires a qualifying bounded result sample.", observation.observationId));
            }
        }
        const canonicalValue = canonicalize(input.moduleName, payload.candidate);
        if (payload.decision === "selected" && seenSelected.has(canonicalValue)) {
            candidateFailures.push(issue("duplicate_candidate", "Selected candidates must be canonically unique.", observation.observationId));
        }
        if (candidateFailures.length > 0) {
            base.failures.push(...candidateFailures);
            if (payload.decision === "selected")
                continue;
        }
        const candidate = {
            displayedValue: payload.candidate,
            canonicalValue,
            rationale: payload.rationale,
            suggestionEvidenceIds: payload.suggestionEvidenceIds,
            resultEvidenceIds: payload.resultEvidenceIds,
            ...(payload.seedProvenance !== undefined ? { seedProvenance: payload.seedProvenance } : {}),
        };
        if (payload.decision === "selected") {
            seenSelected.add(canonicalValue);
            base.researchedRecommendations.push(candidate);
        }
        else {
            const rejected = {
                ...candidate,
                reasonCode: payload.reasonCode,
            };
            base.rejectedCandidates.push(rejected);
        }
        base.evidenceReferences.push(observation.observationId, ...payload.suggestionEvidenceIds, ...payload.resultEvidenceIds);
    }
    if (input.recommendationRange &&
        base.researchedRecommendations.length > input.recommendationRange.max) {
        base.failures.push(issue("recommendation_range_exceeded", `At most ${input.recommendationRange.max} recommendations are allowed for this channel and module.`));
    }
    if (base.researchedRecommendations.length > 0) {
        if (zeroDecisions.length > 0) {
            base.failures.push(issue("conflicting_zero_decision", "A module cannot be both recommended and zero."));
        }
        base.outcome = base.failures.length > 0 ? "failed" : "recommended";
    }
    else if (zeroDecisions.length > 0) {
        const latestZero = zeroDecisions.at(-1);
        const definitiveInitialEmpty = suggestionSets.some((item) => item.source.kind === "browser_ui") &&
            suggestionSets
                .filter((item) => item.source.kind === "browser_ui" &&
                (item.payload.round ?? 0) === 0)
                .every((item) => item.payload.stoppingReason === "native_empty");
        if (attemptedRefinement.size === 0 && !definitiveInitialEmpty) {
            base.failures.push(issue("missing_refinement_round", "A zero outcome requires one refinement round unless native evidence was definitively empty."));
        }
        if (base.rejectedCandidates.length === 0 && latestZero.payload.zeroReason !== "no_native_candidates") {
            base.failures.push(issue("missing_rejected_candidates", "Plausible shortlisted candidates must be rejected before this zero reason."));
        }
        const zeroRefsValid = latestZero.payload.suggestionEvidenceIds.every((id) => suggestionSets.some((item) => item.observationId === id && item.source.kind === "browser_ui"));
        if (!zeroRefsValid) {
            base.failures.push(issue("missing_zero_evidence", "Zero decision evidence references must identify suggestion observations."));
        }
        base.zeroReason = latestZero.payload.zeroReason;
        base.evidenceReferences.push(latestZero.observation.observationId, ...latestZero.payload.suggestionEvidenceIds);
        base.outcome = base.failures.length > 0 ? "failed" : "zero";
    }
    else {
        base.failures.push(issue("missing_module_decision", "The host must record selected, rejected, or zero decisions."));
        base.outcome = "failed";
    }
    base.evidenceReferences = [...new Set(base.evidenceReferences)];
    return base;
}
//# sourceMappingURL=reducer.js.map