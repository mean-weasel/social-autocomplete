# Social Metadata QA Channel Subsets

## Objective

Make QA channel selection genuinely user-controlled: every fresh run may use
any nonempty ordered subset of the channels available in the selected browser,
and no oracle, manager, worker, or receipt may add omitted channels or force an
all-channel run.

## Original Request

“How shall we organize this as a GoalBuddy Prep board?”

## Intake Summary

- Input shape: `existing_plan`
- Audience: Codex users running local social-metadata QA and maintainers of the
  QA manager/worker contract
- Authority: `approved`
- Proof type: `test`
- Completion proof: exhaustive ordered-subset compatibility tests, full
  release verification, an exact QA source pin, and a supervised replay of the
  saved `Instagram → Facebook → LinkedIn` scenario that never introduces an
  omitted channel
- Goal oracle: automated compatibility coverage plus a sanitized
  manager/worker receipt proving the selected channel order is the only order
  dispatched
- Likely misfire: relaxing exact equality without proving browser
  compatibility, order preservation, omitted-channel exclusion, and oracle
  independence from user answers
- Blind spots considered: the distinction between browser capabilities and a
  run plan, in-app public-surface limits, duplicate channels, migration from
  `qa-oracle/v1`, QA-repository source pins, and live authentication/UI-change
  interruptions
- Existing plan facts:
  - A fresh run must accept any nonempty ordered subset of channels available
    in the chosen browser.
  - Chrome makes all seven channels available; the Codex in-app browser makes
    only TikTok, YouTube, and Pinterest public surfaces available.
  - Each selected channel may appear at most once, and scenario order is
    authoritative.
  - The oracle is a browser capability contract, not a generated run plan.
  - Scenario authentication coverage remains exact for selected channels.
  - The manager must choose a compatible canonical oracle and must never ask
    the user to expand a subset merely to match an oracle.
  - Pinterest hashtag remains `not_applicable`.
  - The existing ignored three-channel scenario should be reusable after the
    fix without repeating the questionnaire.

## Goal Oracle

The oracle for this goal is:

`npm run test:qa-config` proves all 13,699 nonempty ordered Chrome subsets and
all 15 nonempty ordered in-app subsets are compatible with the correct
capability oracle; `npm run verify:release --
--allow-missing-live-receipts` passes; the QA repository pins the exact product
commit and source hashes; and a supervised manager/worker replay of the saved
`Instagram → Facebook → LinkedIn` scenario dispatches exactly those three
channels in that order, with truthful authentication or UI-change outcomes
allowed but no omitted channel present in the run or receipt.

The PM must keep comparing task receipts to this oracle. Planning, a relaxed
validator, or a passing all-channel example is not enough. The goal finishes
only when a final Judge/PM audit maps receipts and verification back to this
oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Validate the capability-oracle design, implement the product contract and
exhaustive tests as one coherent slice, adversarially review the result, pin
the dedicated QA repository to the verified product commit, then resume the
saved three-channel QA scenario for selected-only dispatch proof.

## Non-Negotiable Constraints

- Do not publish, open composers, scrape, bypass authentication, or launch
  temporary/profile-less Chromium.
- Never request, type, read, transmit, or persist credentials, cookies, tokens,
  one-time codes, account identifiers, profile paths, or browser storage.
- Preserve the stable CLI/JSON contract and project-local resumability.
- Preserve explicit browser selection before channel selection.
- A fresh run asks for channels; only an explicit resume of the same `runId`
  may reuse a prior ordered list.
- Treat oracle channel order as non-authoritative; scenario order controls the
  worker and receipt.
- Do not generate or rewrite a canonical oracle from questionnaire answers.
- Do not broaden Codex in-app browser support beyond TikTok, YouTube, and
  Pinterest public surfaces.
- Keep Claude and CI expansion out of scope.
- Keep private scenario, run state, notes, receipts, and screenshots ignored by
  Git.
- Preserve the completed historical goal boards.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after schema or validator changes if manager instructions, QA
source pins, or selected-only replay proof remain incomplete.

If live authentication or a platform UI change interrupts research, record the
truthful outcome and continue evaluating channel-selection correctness; those
external conditions do not invalidate the subset contract.

## Slice Sizing

The schema, canonical capability oracles, validator, manager/worker
instructions, and exhaustive tests form one coherent product-contract Worker
slice. The QA source pin and supervised replay are separate because they depend
on an exact verified product commit and human browser authorization.

## Board Health

```bash
node /Users/neonwatty/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/social-metadata-qa-channel-subsets
```

## Canonical Board

Machine truth lives at:

`docs/goals/social-metadata-qa-channel-subsets/state.yaml`

## Run Command

```text
/goal Follow docs/goals/social-metadata-qa-channel-subsets/goal.md.
```

## PM Loop

On every `/goal` continuation, read this charter and `state.yaml`, follow the
GoalBuddy execution contract, work only on the active task, record a receipt,
update the board, and continue until the final oracle audit succeeds.
