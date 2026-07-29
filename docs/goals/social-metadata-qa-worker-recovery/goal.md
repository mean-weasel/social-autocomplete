# Social Metadata QA Worker Recovery

## Objective

Make manager-driven QA recover from Codex worker-host failure without creating
duplicate continuation tasks, repeating completed channel work, changing the
approved run, or widening browser authorization.

## Original Request

“Harden worker-host recovery, then rerun the live Instagram → Facebook →
LinkedIn QA scenario.”

## Intake Summary

- Input shape: `recovery`
- Audience: Codex users running local social-metadata QA and maintainers of the
  manager/worker protocol
- Authority: `approved`
- Proof type: `test`
- Completion proof: deterministic failure-injection tests plus a supervised
  selected-only replay from a clean, exactly pinned QA installation
- Goal oracle: simulated host failure at every meaningful protocol boundary
  produces at most one manager-owned continuation, preserves durable run
  state, never repeats a browser action, and either resumes safely or ends at
  the retry bound with one truthful `run_stopped`
- Likely misfire: documenting recovery while leaving both the bootstrap worker
  and manager able to spawn continuations, or retrying in a way that duplicates
  browser work
- Blind spots considered: message delivery versus persistence races,
  continuation creation failure, completed-channel replay, stale cursors,
  one-time authorization, retry exhaustion, private-artifact isolation, and
  recovery after the plugin reinstall boundary
- Existing plan facts:
  - Only the manager owns continuation-task creation.
  - The same `runId`, scenario checksum, browser, channel order, and next
    protocol sequence must survive recovery.
  - At most one continuation may be live for a run.
  - Completed channels and accepted browser actions must never repeat.
  - Retry behavior is bounded and fail-closed.
  - The final live replay is Instagram → Facebook → LinkedIn and requires
    fresh explicit browser authorization.

## Goal Oracle

The oracle for this goal is:

1. Deterministic tests inject host failure before and after request delivery,
   after a channel result is durably recorded, and during continuation
   creation.
2. Every case proves that only the manager creates a continuation, at most one
   continuation identity is active, the same approved run is preserved, and
   completed work is not replayed.
3. Retry exhaustion emits exactly one truthful `run_stopped` with no product
   failure claim.
4. Full release verification passes and the dedicated QA repository pins the
   exact reviewed implementation commit.
5. A fresh, explicitly authorized Instagram → Facebook → LinkedIn replay
   completes or stops truthfully without any duplicate or omitted-channel
   browser action.

The PM must keep comparing receipts to this oracle. A prose-only runbook fix,
representative happy-path test, or successful retry that cannot disprove
duplicate browser work is insufficient. The goal finishes only when a final
Judge or PM audit records `full_outcome_complete: true`.

## Goal Kind

`recovery`

## Current Tranche

Map the observed coordination race, choose one recovery owner and durable state
contract, implement the complete recovery path with adversarial tests, pin the
QA worker materials to the reviewed build, then perform one fresh selected-only
browser replay.

## Non-Negotiable Constraints

- The manager is the only component allowed to create or authorize a recovery
  continuation.
- A bootstrap/installer worker may report failure or handoff state but may not
  independently race the manager to create another continuation.
- Recovery must retain the exact `runId`, scenario/oracle checksums, browser,
  channel order, next sequence, completed-channel set, and accepted-action
  checkpoint.
- Recovery may not replay a completed channel, resend an accepted browser
  action, reset sequence numbers, widen channels, switch browsers, or extend
  authorization.
- One-time browser approval applies only to the same run and must be consumed
  after its terminal result.
- Never request, read, transmit, or persist credentials, cookies, tokens,
  one-time codes, account identity, browser profiles, or storage state.
- Never publish, enter a composer, scrape, bypass a challenge, or launch a
  temporary/profile-less browser.
- Keep Claude and CI expansion out of this tranche.
- Keep private scenarios, manager records, QA notes, receipts, screenshots,
  and run state ignored by Git.
- Preserve the completed channel-subset goal and its historical receipts.

## Stop Rule

Stop only when the final audit proves the full recovery oracle.

Do not stop after selecting a recovery design or adding retry prose. Continue
through implementation, failure injection, QA source pinning, and the live
replay. A truthful external authentication, challenge, UI-change, or
worker-host interruption may end the browser replay, but the deterministic
recovery tests must still prove single-owner, no-duplicate behavior.

## Slice Sizing

The durable recovery state, manager-only continuation ownership, protocol
wording, failure injection, and focused tests form one coherent implementation
slice. QA source pinning and live replay remain separate because they depend on
an exact reviewed commit and fresh human browser authorization.

## Board Health

```bash
node /Users/neonwatty/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/social-metadata-qa-worker-recovery
```

## Canonical Board

Machine truth lives at:

`docs/goals/social-metadata-qa-worker-recovery/state.yaml`

## Run Command

```text
/goal Follow docs/goals/social-metadata-qa-worker-recovery/goal.md.
```

## PM Loop

On every `/goal` continuation, read this charter and `state.yaml`, follow the
GoalBuddy execution contract, work only on the active task, record a receipt,
update the board, and continue until the final oracle audit succeeds.
