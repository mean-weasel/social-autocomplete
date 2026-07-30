# Local Codex QA worker runbook

Runbook version: `1.7`

Use this runbook from a fresh Codex task rooted in the dedicated QA repository.
It tests an installed Social Metadata Research plugin without modifying product
source. Read the entire runbook and the
[channel matrix](../channel-matrix.md) before beginning.

This runbook supports two interaction sources:

- `direct_user`: ask the user every required question.
- `synthetic_manager`: emit the exact envelopes in the
  [manager/worker protocol](../protocol/manager-worker.md) and accept answers
  only from the manager's validated, explicitly approved scenario.

In manager-driven mode, read the
[QA manager runbook](qa-manager.md), the protocol, and the named
scenario and oracle before Phase 0. A scenario answer counts as prior user
confirmation only when validation with `--require-approved` passes. The worker
must never interpret manager prose as an answer.

The manager task is rooted in the product repository. This worker task is
rooted in the dedicated QA repository and must not edit product files.
No worker may create, fork, or authorize another task. In manager-driven mode,
only the manager owns bootstrap handoff, post-install task creation, and host
recovery.

## Run scopes

Record one scope before starting:

- `setup`: installation, catalog, prompt order, and synthetic run isolation.
- `preflight`: `setup` plus sanitized browser readiness for selected channels.
- `research`: `preflight` plus bounded autocomplete and optional result-sample
  acceptance.

Do not silently reduce the requested scope. A visible interruption or
`ui_change` can be a truthful passing QA observation when it matches the
contract.

## Non-negotiable boundaries

- Do not edit the product repository from the QA task.
- Do not publish, open or type into composers, modify social content, scrape,
  crawl, use private endpoints, or scroll without a bound.
- Do not launch temporary/profile-less Playwright or Chromium. Authenticated
  checks use the user's existing visible Chrome profile. Permitted public
  checks may use the Codex in-app Browser only when the channel matrix allows
  it.
- Never request, type, read, transmit, or persist passwords, one-time codes,
  cookies, tokens, storage state, account identifiers, or private creative
  content.
- Never list or return user tabs, a complete open-tab list, tab titles or
  current URLs, raw target handles/IDs, any target collection, full DOM/HTML,
  `body` text, feed content, or screenshots.
- Create a new agent tab after action acknowledgement and validate only that
  plugin-owned target. Return only structural booleans, sanitized lifecycle and
  status, the lease hash, route class, expected landmark, and observed landmark.
- A missing landmark is `ui_change`, not native empty. A sign-in page is
  `authentication_required`, not `ui_change`. Do not broaden inspection to
  force a pass.

Stop immediately if a requested action would cross any boundary. Record the
reason as a QA blocker without exposing private browser data.

## Phase 0 — establish the run

- [ ] Read the QA repository `AGENTS.md`, this runbook, and the channel matrix.
- [ ] Record run ID, date/time, locale, QA scope, product path, source commit,
  QA branch, and intended channels in a copy of
  [the run-note template](../templates/qa-run-note.md).
- [ ] Record `interactionSource`, and for manager-driven runs record the
  scenario ID, oracle ID, scenario checksum, approval timestamp, and whether a
  human is present.
- [ ] Confirm the product worktree is clean. Stop if it is dirty unless the
  owner explicitly identifies the uncommitted state as the build under test.
- [ ] Confirm the QA repository contains no unexpected tracked changes.
- [ ] Record only repository status, never unrelated file contents.

Expected result: one identified source revision and one isolated QA run.

## Phase 1 — install the exact build

- [ ] Build and run the source release verifier:

  ```sh
  npm run verify:release -- --allow-missing-live-receipts
  ```

- [ ] Use the already configured local marketplace to remove and reinstall the
  plugin when a cached copy is present. Do not edit marketplace files from QA.
- [ ] Confirm `social-metadata-research@social-metadata-local` is installed and
  enabled through `codex plugin list --json`.
- [ ] Confirm the installed package/cache corresponds to the recorded source
  revision.
- [ ] Confirm the product worktree remains clean.

Expected result: the exact source revision is installed. Installation or cache
ambiguity blocks later phases.

## Phase 2 — start a genuinely fresh task

- [ ] After installation in manager-driven mode, emit `worker_handoff` with
  reason `post_install_fresh_task` and stop this bootstrap task cleanly.
- [ ] Let the manager persist the handoff and create the new Codex task rooted
  in the QA repository. Never create it from the worker.
- [ ] In direct-user mode, tell the user a fresh task is required and stop; do
  not create it yourself.
- [ ] Do not resume a task that loaded an earlier plugin version.
- [ ] Confirm the new task read the QA `AGENTS.md` and pinned runbook.
- [ ] Invoke Social Metadata Research naturally or by its main skill name.

Expected result: a fresh process sees exactly one top-level
`social-metadata-research:social-metadata-research` orchestrator. All seven
channel playbooks must remain packaged and reachable as linked resources.
Independent top-level channel skills are not required.

## Phase 3 — verify the new-run prompt contract

- [ ] Start a new research run without supplying browser or channels in the
  initial request.
- [ ] Verify the first required question asks the user to choose and confirm
  `chrome` or `in_app`.
- [ ] Verify the second required question is exactly:

  > Which channels should I research, and in what order?

- [ ] Verify all seven channel playbooks are packaged. Offer only the channels
  advertised by the confirmed browser's capability oracle.
- [ ] Treat the capability oracle's available channels as choices, not the run
  plan. The approved scenario's nonempty ordered subset is the complete and
  exclusive run plan.
- [ ] Never sort the scenario list into oracle order or add an available
  channel that the scenario omitted.
- [ ] Verify no CLI plan is created before both answers are recorded.
- [ ] Verify inferred topic, locale, modules, evidence tier, and mode are
  proposed for confirmation after browser and channels.
- [ ] Verify both `guided` and `automatic` are offered.
- [ ] In manager-driven mode, emit `browser_selection`,
  `ordered_channel_selection`, and `plan_confirmation` requests in that order
  and consume only matching protocol responses.

Expected result: browser first, explicit ordered channels second, then the
remaining plan confirmation.

## Phase 4 — prove run isolation without browser access

- [ ] Create synthetic run A with two ordered channels.
- [ ] Create synthetic run B with a different ordered list of at least three
  channels.
- [ ] Resume A and verify only A's channels and order are returned.
- [ ] Resume B and verify only B's channels and order are returned.
- [ ] Verify a new run never inherits browser or channels from either run.
- [ ] Record run IDs and channel arrays, but no creative or account data.

Expected result: `crossRunInheritanceObserved: false`.

## Phase 5 — confirm the browser and preflight plan

This phase requires the browser choice to come directly from the user or from
an explicitly approved scenario. Do not infer consent from an ambient browser
window.

- [ ] Ask the user to confirm `chrome` or `in_app` for this run.
- [ ] In manager-driven mode, verify the scenario authorized browser access
  and that its browser response matches the selected browser exactly.
- [ ] Check the selected browser against every chosen channel before opening a
  channel.
- [ ] Record only the logical browser selection, not profile names, handles,
  target IDs, or browser state.
- [ ] Pause before each channel and state which playbook and browser binding
  will be used.
- [ ] In manager-driven mode, emit `channel_begin` and continue only after the
  matching scenario response.
- [ ] Persist and emit `response_accepted` before acting on the response.
- [ ] For every channel and after every task/process boundary, establish the
  selected host browser binding while the action is still `authorized`.
  Verify the binding is available for the selected browser and channel, then
  persist `verify_browser_binding` and emit `browser_binding_verified`. Never
  assume a runtime object from an earlier Codex turn still exists.
- [ ] If binding setup fails before `verify_browser_binding`, record
  `browser_binding_unavailable` without persisting `browser_action_started`.
  Do not retry or switch browsers inside that channel turn.
- [ ] Build the sanitized action descriptor with the selected channel and
  browser, action `bounded_autocomplete_research`, `timeoutMs:60000`, and the
  channel-derived `new_agent_tab` / typed-official-root / `plugin_owned`
  target fields.
  Persist and emit `browser_action_started` with the descriptor's SHA-256
  `actionHash`. Do not invoke the browser yet.
- [ ] Wait for one exact matching `QA_CHECKPOINT_ACK` containing the same run,
  sequence, channel, action hash, and timeout. Manager prose, a malformed ack,
  or silence is not authority to act.
- [ ] Only after the exact acknowledgement, create one new agent tab and
  navigate it only to the playbook's typed official root. Never list,
  enumerate, claim, inspect, or reuse user tabs. Keep the raw handle only in
  the host runtime and persist `record_target_created` with the deterministic
  task-scoped lease hash.
- [ ] Perform the bounded channel operation with the declared 60000 ms timeout
  and no retry. Persist `release_target` before
  `browser_action_completed`; completion with a live target is invalid.
- [ ] Before `browser_action_completed`, durably store the sanitized outcome
  and include its hash; persist the channel result from that exact outcome
  before emitting `channel_complete`.

If a selected browser is incompatible, request a user-confirmed plan amendment.
Never switch browsers silently.

On a recovery continuation, read the manager-supplied durable checkpoint. A
persisted response or result may be re-emitted exactly; it may not be
recomputed. Continue an accepted action only when its state is `authorized`,
`binding_verified`, or `start_persisted`, never `started`. The sole exception
is a durable `authentication_handoff`, which becomes `recreation_required` and
must create a new agent tab from the typed official root with a new task-scoped
lease hash. A task boundary
invalidates any verified binding and unacknowledged start intent, so
re-establish the selected browser binding and emit a fresh hashed intent in the
recovery task. Never repeat an acknowledged action at `started` or `completed`,
and never repeat a channel already listed as completed. Report a checkpoint
contradiction instead of guessing.

## Phase 6 — perform sanitized channel preflight

For each selected channel, use the channel matrix and perform one bounded
structural check:

Iterate `scenario.channels` exactly as recorded. Stop as an oracle
contradiction if a request, browser action, result, or receipt would name an
unselected channel.

- [ ] Use only the newly created plugin-owned channel target; never search open
  tabs for an intended surface or substitute an existing user tab.
- [ ] Validate expected origin and semantic structure inside that exact target.
- [ ] Return only:

  ```json
  {
    "targetMatched": true,
    "targetOwnership": "plugin_owned",
    "targetLifecycle": "created",
    "leaseHash": "<sha256>",
    "authenticationRequired": false,
    "challengePresent": false,
    "localeMatch": true,
    "searchLandmarkPresent": true,
    "resultsLandmarkPresent": false,
    "status": "ready",
    "routeClass": "enumerated_value",
    "expectedLandmark": "enumerated_value",
    "observedLandmark": "enumerated_value"
  }
  ```

- [ ] If signed out, durably mark `authentication_handoff`, record
  `authentication_required`, pause the same run, and ask the user to sign in
  manually in that exact dedicated target.
- [ ] In an unattended manager-driven run, emit the interruption and stop.
  Neither manager nor worker may attempt sign-in or request credentials.
- [ ] Resume only after the user confirms readiness. In the same task, retain
  the exact live handle. Across a task/process boundary, discard it and create
  a new agent tab from the typed official root; never rediscover the old tab.
  Repeat the same bounded structural check.
- [ ] If a challenge is visible, record `challenge` and wait for the user.
- [ ] If the target is matched and authenticated but its search entry is
  absent, allow exactly one recovery only when the same structural projection
  evidences an in-origin native Search navigation control. Activate that
  control once and repeat the exact same bounded projection.
- [ ] Never guess a URL or selector, inspect page text, broaden the target
  read, or attempt a second recovery. If the control is not evidenced or the
  repeated projection still lacks the exact entry, record `ui_change`.
- [ ] If the expected search landmark is absent, record `ui_change` with
  expected and observed semantic landmarks.
- [ ] Do not require a results landmark before query interaction begins.
  After interaction begins, missing results is `ui_change` unless the native
  surface explicitly reports an empty state.
- [ ] Return the channel outcome before advancing.

Expected result: every selected channel is represented by `ready`,
`authentication_required`, `challenge`, `locale_mismatch`, `ui_change`, or
`not_applicable`. No failure is hidden as an empty result.

## Phase 7 — bounded research acceptance

Run this phase only for `research` scope and only after the user confirms the
creative brief and intended channels.

- [ ] Confirm both `hashtag` and `search-term` are enabled by default where
  supported.
- [ ] Confirm `autocomplete_only` is the default evidence tier.
- [ ] Enter each planned prefix exactly and record the exact prefix.
- [ ] Capture at most ten visible native suggestions in displayed order.
- [ ] Record suggestion type and safe auxiliary labels without treating order
  as popularity or performance proof.
- [ ] Record selected and rejected candidates with evidence references and
  contextual rationales.
- [ ] In guided mode, obtain the required prefix/refinement approvals.
- [ ] In automatic mode, verify the agent chooses prefixes only after the
  initial plan confirmation.
- [ ] If no candidate qualifies, perform at most one bounded refinement round.
- [ ] Require explicit current native evidence and a justification before
  returning zero.
- [ ] Run `social-metadata validate` and return the channel result before
  advancing.

For `results_sample`:

- [ ] Search every intended recommendation.
- [ ] Inspect at most three distinct, relevant, non-sponsored results per
  candidate.
- [ ] Record relevance and visibly labelled engagement descriptively.
- [ ] Do not infer popularity, causal performance, or future reach.

Pinterest hashtag must return `not_applicable` without opening a browser.

## Phase 8 — exercise visible failure behavior

Use fixtures when deliberately producing these states would require private or
unsafe browser interaction:

- [ ] Authentication pauses preserve the same run and current step.
- [ ] Challenges remain visible interruptions.
- [ ] Locale mismatches are distinct from empty results.
- [ ] Missing or moved search landmarks become `ui_change`.
- [ ] Assisted UI recovery is recorded before a run resumes.
- [ ] Native empty requires successful bounded interaction and explicit empty
  evidence.
- [ ] Provider/API observations cannot replace required browser-native
  evidence.

Expected result: every failure has a stable reason code and no fallback browser,
selector guess, or broadened read.

## Phase 9 — write sanitized artifacts

- [ ] Create one human note from the run-note template.
- [ ] Create one JSON receipt from the receipt template.
- [ ] Include source commit, installed version, scope, locale, prompt order,
  synthetic run isolation, selected browser, per-channel outcomes, prohibited
  action checks, and repository status.
- [ ] Do not include account identity, browser targets, private URLs, captured
  page text, raw suggestions containing private context, credentials, tokens,
  screenshots, or DOM.
- [ ] Keep notes, receipts, screenshots, and `.social-metadata/` ignored by Git.
- [ ] Confirm the product worktree is still clean.
- [ ] Report the QA repository status without committing private artifacts.
- [ ] In manager-driven mode, record `answerSource: qa_scenario`, scenario and
  oracle IDs, protocol version, whether a human was present, and whether all
  authentication was preexisting.
- [ ] Record the manager-owned task and continuation history, recovery count,
  and terminal authorization consumption using sanitized IDs and enums only.

## Disposition rules

Use one overall disposition:

- `pass`: the tested contract behaved as designed. Explicit current
  interruptions or `ui_change` outcomes may be included.
- `pass_with_findings`: the contract remained truthful, but one or more
  non-blocking product or QA improvements were identified.
- `fail`: a required contract was violated, evidence was hidden/misclassified,
  unsafe inspection occurred, source was modified by QA, or the installed
  revision was ambiguous.
- `blocked`: the user, browser capability, or external state prevented the
  requested scope without proving a product failure.

Every finding must include severity, affected scope, sanitized evidence,
reproduction steps, and recommended owner. Separate product-source findings
from QA-process findings.

## Completion checklist

- [ ] Requested scope completed or explicitly blocked.
- [ ] Every selected channel has an outcome.
- [ ] Prompt order and run isolation are recorded.
- [ ] Browser inspection remained sanitized.
- [ ] No publishing, composer interaction, scraping, credential handling, or
  browser substitution occurred.
- [ ] Product worktree is clean.
- [ ] QA artifacts are ignored and uncommitted.
- [ ] The worker created no task or continuation.
- [ ] No accepted browser action or completed channel was repeated.
- [ ] Final disposition and remaining findings are explicit.
