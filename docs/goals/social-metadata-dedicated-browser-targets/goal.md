# Social Metadata Dedicated Browser Targets

## Objective

Give every selected research channel a dedicated, safely created browser target that the agent can retain through bounded research and sign-in pauses without enumerating or inspecting unrelated user tabs.

## Original Request

“Plan out reliable bounded target acquisition so the plugin can establish a dedicated official channel tab, retain its exact browser binding, and use only that tab for research.”

## Intake Summary

- Input shape: `specific`
- Audience: Codex and Claude users running browser-first social metadata research
- Authority: `requested`
- Proof type: `demo`
- Completion proof: A fresh authorized Chrome run creates and binds dedicated Instagram, Facebook, and LinkedIn targets, reaches each native search entry, and records current hashtag and search-term autocomplete evidence or a justified native-zero without exposing unrelated browser state.
- Goal oracle: Sanitized lifecycle receipts and end-to-end browser acceptance prove exact dedicated-target creation, retention, sign-in pause/resume, channel isolation, and bounded research.
- Likely misfire: Making `target_unavailable` disappear by broadly enumerating tabs, persisting private target metadata, guessing routes/selectors, or weakening UI-change diagnostics.
- Blind spots considered: Host browser handle lifetime, task/process recovery, login pauses, browser-choice parity, user-closing or navigating the dedicated tab, duplicate targets, and safe cleanup.
- Existing plan facts: Existing visible Chrome is required for authenticated sessions; the Codex in-app browser remains the public-surface option; browser choice is recorded and adjustable; channels are selected per fresh run; each channel requires a pause before research; credentials are never stored; browser actions retain the two-phase acknowledgement gate; no publishing, composer interaction, scraping, or unrelated tab inspection is permitted.

## Goal Oracle

The oracle for this goal is:

`A fresh one-time-authorized Instagram → Facebook → LinkedIn Chrome replay shows targetMatched=true and the exact native search-entry landmark for every channel, records bounded hashtag and search-term autocomplete evidence or a justified native-zero, and proves that only plugin-created dedicated targets were touched.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, fixture-only success, or a clean-looking board is not enough. The goal finishes only when a final Judge maps implementation, offline verification, exact QA pinning, and fresh sanitized live evidence back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Map the host-browser target lifecycle, choose a privacy-preserving dedicated-target contract, implement it across the shared browser orchestration and both browser choices, pin the exact build into the isolated QA repository, and prove the authenticated Chrome path on Instagram, Facebook, and LinkedIn. If live evidence reveals a locally fixable lifecycle defect, continue with another bounded implementation and replay slice rather than accepting `target_unavailable`.

## Non-Negotiable Constraints

- Use the existing visible signed-in Chrome profile for authenticated research; never launch temporary or profile-less Chromium.
- Prefer the Codex in-app browser only for public surfaces, according to the recorded browser choice.
- Create or acquire only a plugin-dedicated official-channel target; never enumerate, inspect, or reuse unrelated existing tabs.
- Keep raw browser target identifiers, URLs, page text, DOM, account identity, credentials, cookies, tokens, screenshots, and private routes out of receipts and tracked state.
- Never store login credentials. If authentication is required, pause in the dedicated target, ask the user to sign in, and resume that same run.
- Preserve the two-phase `browser_binding_verified` → canonical `browser_action_started` → exact `QA_CHECKPOINT_ACK` gate before every browser operation.
- Preserve per-run browser and ordered-channel selection. A fresh run never inherits prior channels; a resume reuses only its own recorded plan.
- Preserve bounded autocomplete-only research, one refinement round before zero, honest `ui_change` and native-zero outcomes, and the rule that autocomplete order is not popularity proof.
- Do not publish, open or interact with composers, scrape feeds, or introduce API, GrowthOps, Buffer, or credential dependencies.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, fixture success, target creation alone, or a single channel if safe local work can still make the three-channel live oracle true.

If exact browser authorization or user sign-in is the only remaining blocker and no safe local work remains, record the blocked checkpoint and required reply once. Do not weaken the browser contract to bypass the user.

## Slice Sizing

The main implementation should be one coherent vertical slice covering target creation, private handle ownership, pause/resume semantics, host adapters, recovery behavior, diagnostics, fixtures, tests, and documentation. Avoid a sequence of tiny helper-only tasks.

## Board Health

Machine truth lives in `state.yaml`. Validate it with:

```bash
node /Users/neonwatty/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/social-metadata-dedicated-browser-targets
```

## Canonical Board

`docs/goals/social-metadata-dedicated-browser-targets/state.yaml`

## Run Command

```text
/goal Follow docs/goals/social-metadata-dedicated-browser-targets/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and the GoalBuddy execution contract.
2. Read `state.yaml` and work only on its active task.
3. Keep the dedicated-target live oracle stronger than fixture or protocol-only proof.
4. Delegate Scout, Judge, Worker, or PM work according to the active card.
5. Record a compact receipt and advance to the largest safe next slice.
6. Finish only after a final Judge maps all evidence to the oracle with `full_outcome_complete: true`.
