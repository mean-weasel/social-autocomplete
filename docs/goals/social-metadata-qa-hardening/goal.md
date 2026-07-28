# Social Metadata QA Hardening

## Objective

Implement the corrected local-QA findings as a coherent hardening tranche: make channel selection explicit on every new run, make authenticated browser QA structurally privacy-safe, restore current LinkedIn and Pinterest research entry diagnostics, and align Codex packaging with the intended one-orchestrator UX.

## Original Request

“Make a detailed plan using GoalBuddy Prep to implement the corrected QA findings.”

## Intake Summary

- Input shape: `existing_plan`
- Audience: Codex users running evidence-backed social metadata research and maintainers performing local QA
- Authority: `approved`
- Proof type: `test`
- Completion proof: the release verifier passes from a clean install and a fresh supervised QA pass proves explicit per-run channel choice, sanitized browser inspection, and current LinkedIn/Pinterest behavior without regressions
- Goal oracle: a receipt-backed clean-install plus supervised-QA report covering the corrected findings
- Likely misfire: changing documentation or catalog assertions without making the user flow, browser safety, and current channel behavior demonstrably work
- Blind spots considered: Codex catalog limits, existing authenticated business-account variants, privacy of transient browser reads, separation of QA state from source, and stale live UI evidence
- Existing plan facts: the corrected QA handoff contains one blocking UX gap, one blocking QA-procedure gap, two channel UI mismatches, and one non-blocking discoverability decision

## Goal Oracle

The oracle for this goal is:

`npm run verify:release -- --allow-missing-live-receipts` passes from the source tree, a clean installed plugin asks explicitly for both browser and ordered channels on a new run, a second new run does not inherit the first run’s channels, authenticated QA emits only sanitized structural landmarks, and fresh LinkedIn/Pinterest acceptance receipts truthfully pass or report a current explicit ui_change with expected/observed landmarks.

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Validate the corrected QA handoff, implement the largest safe coherent source packages, verify each package with focused and release gates, then rerun isolated local QA against a clean plugin install. Continue until all corrected findings are either fixed and proved or explicitly deferred by an owner decision with evidence.

## Non-Negotiable Constraints

- Do not publish, open composers, scrape, bypass authentication, or use temporary/profile-less Chromium.
- Never request, type, read, transmit, or persist credentials, cookies, tokens, storage state, account identifiers, broad open-tab listings, or full authenticated DOM snapshots.
- Browser QA may emit only targeted structural booleans, sanitized status, and expected/observed semantic landmarks.
- Keep development changes in `/Users/neonwatty/Desktop/social-autocomplete` and QA artifacts in `/Users/neonwatty/Desktop/social-autocomplete-qa`.
- Preserve the stable CLI/JSON boundary and project-local resumability.
- Claude and CI work remain deferred; local Codex QA and existing local verification gates are in scope.
- Treat the main orchestrator as the default product surface unless evidence proves direct channel invocation is required.
- Preserve user changes and do not rewrite the completed `social-metadata-research-v1` goal board.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package while another corrected QA finding still has safe local follow-up work.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny. Combine repeated same-shape channel or documentation changes when their write scopes and verification are coherent.

## Board Health

```bash
node /Users/neonwatty/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/social-metadata-qa-hardening
```

## Canonical Board

Machine truth lives at:

`docs/goals/social-metadata-qa-hardening/state.yaml`

## Run Command

```text
/goal Follow docs/goals/social-metadata-qa-hardening/goal.md.
```

## PM Loop

On every `/goal` continuation, read this charter and `state.yaml`, follow GoalBuddy execution rules, work only on the active task, record a receipt, update the board, and continue to the next safe task until the final oracle audit succeeds.
