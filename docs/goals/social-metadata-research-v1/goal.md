# Implement Browser-First Social Metadata Research v1

## Objective

Implement the approved standalone social metadata research v1 as a working, independently dogfoodable TypeScript CLI with first-class Codex and Claude plugins, channel-native browser playbooks, durable evidence receipts, fixture replay, and release-grade verification.

## Original Request

Make a detailed implementation plan using GoalBuddy Prep based on the approved social metadata research design specification.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Codex and Claude users researching social metadata directly or through a subprocess integration such as Lineage
- Authority: `approved`
- Proof type: `demo`
- Completion proof: A clean-checkout release verification passes, both host plugins install and drive equivalent workflows, all supported channel/module fixtures replay, and browser acceptance receipts demonstrate the channel playbooks without publishing or scraping.
- Goal oracle: `npm run verify:release` passes from a clean checkout, the subprocess example consumes only versioned stdout JSON, Codex and Claude parity checks pass, and current browser-acceptance receipts cover the required channel matrix and interruption paths.
- Likely misfire: Producing schemas, mocked fixtures, and attractive plugin instructions that pass unit tests but do not work through real host/browser flows, or weakening evidence rules to make acceptance pass.
- Blind spots considered: Current Codex and Claude plugin packaging requirements, host browser capability differences, authenticated acceptance availability, platform UI drift, private fixture sanitization, project-local Git exclusion, and the absence of pre-existing project tooling.
- Existing plan facts: The approved design is committed at `docs/superpowers/specs/2026-07-27-social-metadata-research-design.md`; v1 modules are `search-term` and `hashtag`; the CLI commands are `plan`, `record-observation`, and `validate`; guided and automatic modes, two evidence tiers, seven channel playbooks, resumable interruptions, stable JSON, private local state, and the explicit non-goals in that design are mandatory.

## Goal Oracle

The oracle for this goal is:

`From a clean checkout, npm run verify:release passes; Codex and Claude clean-install smoke tests and cross-host fixture parity pass; a subprocess consumer completes plan -> record-observation -> validate using stdout JSON only; and current browser-acceptance receipts cover Facebook, Instagram, LinkedIn, X, TikTok, YouTube, and Pinterest according to the approved support matrix, including authentication/UI interruption behavior and zero/not-applicable outcomes.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Continuous implementation of the complete approved v1. Validate packaging and browser assumptions first, then complete successive safe vertical slices: executable CLI protocol, module engine, channel playbooks, both host packages, cross-host integration, browser acceptance, and final release proof.

## Non-Negotiable Constraints

- Preserve the approved design at `docs/superpowers/specs/2026-07-27-social-metadata-research-design.md`.
- Do not publish, enter composers, scrape, crawl, enumerate hidden DOM state, or use private platform endpoints.
- Do not add Buffer, GrowthOps, Lineage, paid provider, credential, or mandatory API dependencies.
- Keep the CLI non-interactive, browser-agnostic, and stdout-JSON-first.
- Keep `search-term` and `hashtag` module schemas isolated.
- Treat `autocomplete_only` and `results_sample` as successful consumable tiers with different proof.
- Do not treat autocomplete position as popularity or performance evidence.
- Require exact native evidence for researched recommendations and keep model suggestions separate.
- Keep private run state project-local, resumable, and Git-ignored.
- Make authentication and UI-change interruptions visible and resumable.
- Implement equal first-class Codex and Claude host support around canonical shared playbooks.
- Use current official host/platform evidence where packaging or browser behavior may have changed.
- Do not commit credentials, cookies, account identifiers, private creative assets, raw DOM dumps, or unsanitized browser evidence.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

If an exact human approval phrase is the only remaining blocker and no safe local work remains, ask once and stop. Preserve the exact phrase in the blocked receipt as `required_reply`, set `waiting_for_user_approval: true`, set `goal.status: blocked`, and set `active_task: null`. Do not keep posting approval prompts until the user replies.

## Board Health

The PM owns board health. If the board looks stale, misleading, offline, or inconsistent, run:

```bash
node /Users/neonwatty/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/social-metadata-research-v1
```

If the local board is running, compare `state.yaml` to the live board API. Repair only GoalBuddy control files unless an active Worker or PM task explicitly allows product-file edits.

## Canonical Board

Machine truth lives at:

`docs/goals/social-metadata-research-v1/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/social-metadata-research-v1/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and follow GoalBuddy's `references/goal-execution.md`.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available.
4. Re-check the approved design, authority, oracle, blind spots, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, activate the next largest reversible package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.
10. Finish only with a Judge/PM audit receipt mapping current proof to the oracle and recording `full_outcome_complete: true`.
