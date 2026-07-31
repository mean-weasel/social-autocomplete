# QA manager runbook

Runbook version: `1.6`

Use this from a Codex manager task rooted in the Social Metadata Research
development repository. The manager interviews the user, writes or edits a
private scenario, validates it against an independently maintained oracle,
starts a fresh worker task rooted in the dedicated QA repository, and answers
only the worker's stable protocol requests.

The manager does not operate the browser. The worker follows the
[QA worker runbook](qa-worker.md). Read that runbook, the
[manager/worker protocol](../protocol/manager-worker.md), and the
[channel matrix](../channel-matrix.md) completely before beginning.

A fresh manager task starts by following the versioned
[manager starter](../prompts/qa-manager-starter.md) directly. The prompt
resolves the current product root and commit, reads or establishes the ignored
project-local manager configuration, and asks which manager mode to use.

## Modes

- `configure`: interview, normalize, validate, show, and approve a scenario.
- `run`: validate an already approved scenario and dispatch a fresh worker.
- `configure_and_run`: complete both flows in order.

Private scenarios belong under `.social-metadata/qa/scenarios/` in this
development repository and must be ignored by Git. Committed files under
`docs/browser-acceptance/scenarios/examples/` are synthetic, unapproved
templates and never authorize browser access. Manager run records belong under
`.social-metadata/qa/manager-runs/`.
Durable coordination state belongs beside them, must conform to
`docs/browser-acceptance/schemas/qa-manager-run-state.schema.json`, and is
updated only through `scripts/browser-acceptance/qa-recovery.mjs`.

The remembered QA worker repository belongs in
`.social-metadata/qa/manager-config.json` and must conform to
`docs/browser-acceptance/schemas/qa-manager-config.schema.json`. If it is
missing, invalid, or no longer resolves to the expected QA workspace, ask the
user to choose and confirm the absolute QA repository path before continuing.
The user may amend the saved path at any time.

## Optional fixed ten-child campaign

Use a campaign only for the fixed QA-only existing-visible-Chrome
Instagram → Facebook → LinkedIn autocomplete replay. It is not available to
the general interview flow and cannot broaden browser, channels, modules,
evidence tier, target ownership, or safety permissions.

Create private state under
`.social-metadata/qa/manager-campaigns/<campaignId>-state.json` with
`qa-campaign.mjs create`. Pin the exact product commit/tree, QA commit/tree,
scenario, oracle, protocol, run reducer, campaign reducer, and scenario schema.
Set expiry no later than seven days after creation. Show the sanitized campaign
ID, scope hash, exact fixed scope, expiry, and ten-run cap. T040 design approval
is not live authorization. Activate only when a new user message contains
exactly:

```text
APPROVE QA BROWSER CAMPAIGN <campaignId> <campaignScopeSha256> FOR 10 RUNS
```

Before each child, require campaign status `active`, current time before
expiry, no active child, fewer than ten issued children, a terminal and
authorization-consumed predecessor, and exact current pins. Prepare a unique
run ID and deterministic private run-state-path SHA-256. Invoke
`issue-child-grant`; use stdout only on exit zero. The reducer atomically burns
the slot before output. Never regenerate, resend, refund, reassign, or recover
a grant whose delivery is ambiguous. All failure and contention losers must
have empty stdout.

Keep only campaign ID and scope hash in the private scenario; ordinal, pin, and
grant hashes remain detached. Hash original scenario/oracle bytes before
decoding, validate with `--campaign-grant <grant-path> --require-approved`,
and pass the detached grant as `campaignGrant` to `qa-recovery.mjs create`.
It must bind the resolved state path before exclusive creation. Populate the campaign placeholders
in the worker dispatch. The grant replaces only the repeated human release;
every per-run one-time authorization, ACK/hash, post-ACK binding, action,
recovery, release, terminal, and privacy gate remains unchanged.

At child terminal, verify the run state has consumed browser authorization and
the receipt has the exact campaign binding. Run `record-child-terminal --grant <grant-path>` with
the private run state and receipt. The reducer stores only the receipt hash and
sanitized terminal facts. Do not issue the successor until reconciliation
succeeds. Release uncertainty is recorded as `terminal_ambiguity`, never
invented as a successful release.

Suspend before new issuance on authentication, challenge, host/action or grant
ambiguity, unsafe input, release uncertainty, pin mismatch, stale claim, or
user pause. With no active child, exact
`RESUME QA BROWSER CAMPAIGN <campaignId> <campaignScopeSha256>` may resume.
Exact `REVOKE QA BROWSER CAMPAIGN <campaignId>` revokes monotonically. Expiry
and revocation allow an already-active child's terminal reconciliation but no
successor. A stale dead-process claim may be recovered only by its exact nonce;
recovery suspends the campaign and never rolls state back.

Pins may advance only between terminal children after Judge approval, exact QA
repin, all declared hash checks, and passing offline/release verification.
The authorization-machinery hashes and immutable scope must remain identical.
Otherwise revoke and obtain fresh exact authorization for a new campaign.

## Phase -1 — interview and scenario authoring

Ask these questions in order. Propose inferred values where the user's context
supports them, but require confirmation before writing an approved scenario:

1. QA scope: `setup`, `preflight`, or `research`.
2. Browser: `chrome` or `in_app`.
3. Any nonempty ordered subset of the channels available in the selected
   browser. Each channel may appear at most once. Chrome offers all seven
   channels; `in_app` offers TikTok, YouTube, and Pinterest public surfaces.
4. Synthetic creative brief. Never place private production content in QA.
5. UI locale, region, and timezone.
6. Modules: `hashtag`, `search-term`, or both.
7. Evidence tier: `autocomplete_only` or `results_sample`.
8. Mode: `guided` or `automatic`.
9. Expected authentication readiness for each selected channel:
   `already_signed_in` or an allowed public surface.
10. Interruption behavior. Authentication and challenge must remain `stop`.
11. Whether the scenario is reusable and, if so, its expiration.
12. Whether browser access may begin unattended or requires a human release
    each time.

Never ask for login credentials, account names, handles, cookies, tokens,
one-time codes, profile paths, or saved browser state. Authentication
configuration expresses readiness expectations only.

Copy the closest committed example into `.social-metadata/qa/scenarios/`,
change its ID, and normalize the answers. Keep the canonical oracle under
`docs/browser-acceptance/oracles/` separate; user scenario answers must not
rewrite expected product behavior.

Select the canonical capability oracle from the confirmed browser:

- Chrome: `oracles/chrome-authenticated-research.yaml`
- Codex in-app browser: `oracles/in-app-public-research.yaml`

The oracle advertises browser capabilities and allowed outcomes. It is not a
run plan: `scenario.channels` remains the sole authority for the selected
channels and their order. Never generate an oracle from questionnaire answers,
sort channels into oracle order, add omitted oracle channels, or ask the user
to broaden a valid subset merely to match an oracle.

Run validation without approval first:

```sh
npm run qa:scenario:validate -- \
  --scenario .social-metadata/qa/scenarios/<scenario>.yaml \
  --oracle docs/browser-acceptance/oracles/<oracle>.yaml
```

Show the normalized scenario to the user with sensitive creative detail
excluded. Ask for explicit approval. Only after approval:

- set `authorization.status: approved`;
- set `authorization.approvedAt`;
- set `authorization.browserAccessAuthorized: true`;
- preserve `authorization.credentialsAuthorized: false`;
- record whether the run is reusable and whether a human release is required.

Then validate with `--require-approved`. Do not dispatch on validation failure.

## Phase 0 — manager preflight

- [ ] Verify the product source revision and QA runbook checksums.
- [ ] Verify the product worktree is clean or explicitly approved as the build.
- [ ] Verify the dedicated QA repository path and its pinned worker runbook.
- [ ] Verify the scenario is compatible with the selected capability oracle.
- [ ] Verify every selected channel is advertised by the oracle and has an
  allowed outcome, while additional advertised oracle channels remain outside
  the run plan.
- [ ] Compute and record the scenario checksum.
- [ ] Verify approval has not expired.
- [ ] Verify private scenario, receipts, notes, screenshots, and run state are
  ignored by Git.
- [ ] Record that the answer source will be `qa_scenario`.
- [ ] Create durable run state with the exact run identity and one-time browser
  authorization before creating any task. Use the deterministic run-state path;
  do not overwrite an existing state file or reuse its authorization ID.

## Phase 1 — start the worker

Create a genuinely fresh Codex task rooted in the dedicated QA repository.
Pass the absolute approved-scenario path, canonical oracle path, their
checksums, and the exact product commit. Prompt it to:

1. read `AGENTS.md`;
2. read the pinned QA worker runbook and channel matrix completely;
3. read the manager/worker protocol from the exact product commit;
4. validate the named scenario and oracle with `--require-approved`;
5. run the selected scope without editing product source;
6. emit only stable protocol envelopes for manager interaction;
7. write ignored, sanitized QA artifacts only in the QA repository; and
8. stop on the protocol's safety conditions.

Build that task prompt from
`docs/browser-acceptance/prompts/qa-worker-dispatch.md`. Replace every
placeholder with the validated run-specific value, verify no placeholder
remains, and send the completed prompt without adding instructions that weaken
the worker runbook or protocol. For an issued bounded-campaign child only,
append `docs/browser-acceptance/prompts/qa-worker-campaign-dispatch.md` after
validating and supplying its exact grant; never add campaign placeholders to an
ordinary worker dispatch.

Record the worker task ID under `.social-metadata/qa/manager-runs/`. Do not
reuse a task that loaded an older plugin version.

The first task may bootstrap installation, but it must never create another
task. After installation it emits `worker_handoff` with reason
`post_install_fresh_task`. The manager persists the handoff and bootstrap
terminal state, reserves the post-install continuation lease, and creates the
fresh execution task. Persist the lease before task creation and activate it
only after task creation returns one confirmed identity. Persist the lease as
`creating` immediately before the one external create call; `reserved` may not
activate directly.

### Codex task coordination

Before dispatch, confirm that the host provides equivalent capabilities for
project listing, task creation, cursor-based task waiting, and task messaging.
Current Codex hosts expose these as `list_projects`, `create_thread`,
`wait_threads`, and `send_message_to_thread`. If any required capability is
unavailable, stop as `coordination_unavailable`. Do not substitute shell
polling, a recurring automation, or an operating-system timer.

Resolve the configured QA repository as a Codex project at run time:

1. list the available projects;
2. match the configured absolute QA repository path;
3. require exactly one matching project;
4. create the worker task in that project using the completed dispatch prompt;
5. record the returned worker task identity and initial cursor in the private
   manager run record.

Never guess or derive a project ID, and never persist an opaque project ID in
manager configuration. The absolute repository path is the durable selection;
the project identity is resolved afresh for each run.

After dispatch, remain active and supervise the worker:

1. wait on the single worker task using its current `afterCursor` and a bounded
   timeout of approximately 60 seconds;
2. when new output arrives, process any complete protocol envelope, record the
   latest cursor, and wait again;
3. when a valid request arrives, send exactly one `QA_RESPONSE` through the
   task-messaging capability, then resume waiting;
4. when the wait times out with no new output, treat it only as a manager
   heartbeat and wait again from the same cursor;
5. never send repeated “status?” messages merely because a wait timed out;
6. do not return a final answer while the worker remains active; and
7. stop the supervision loop only for `run_complete`, `run_stopped`, a
   human-action interruption, a protocol violation, or a coordination failure.

Apply every request, response, worker acknowledgement, browser-action
checkpoint, result, task handoff, task terminal state, and continuation
transition through the durable reducer:

```sh
node scripts/browser-acceptance/qa-recovery.mjs apply \
  --state .social-metadata/qa/manager-runs/<run-id>-state.json \
  --event .social-metadata/qa/manager-runs/<run-id>-event.json
```

The event file is private, minimal, and overwritten for each transition. Never
hand-edit sequence, action, result, authorization, or continuation fields.

Surface authentication, challenge, approval, or other human-action
interruptions to the user without attempting to resolve them. A wait timeout
is not a worker result, not a protocol event, and not evidence of a hung run.

### Terminal host failure

A task `systemError` or equivalent host-terminal state is coordination
evidence, not a worker protocol result. Persist the active task as terminal
before deciding whether recovery is safe. Only the manager may recover:

1. Read the reducer checkpoint; do not reconstruct it from chat.
2. If an action is `started` without durable `completed`, stop once as
   `ambiguous_browser_action`.
3. If no host recovery has been used, reserve its deterministic lease before
   task creation. The exact retry limit is one.
4. Persist `creating`, then make one recovery-task create call with the same
   run ID, checksums, browser, ordered channels, next sequence, completed
   channels, and persisted hashes.
5. Activate the lease only after one task identity is returned. If creation is
   ambiguous—or the manager restarts with unresolved `creating`—stop once as
   `continuation_creation_ambiguous`; do not retry.
6. If the recovery task also fails at the host, emit one `run_stopped` with
   reason `worker_host_unavailable`, no product finding, and
   `resumeSupported:false`.

Workers may report handoff or terminal facts but may never create a task. At
most one continuation lease may be reserved or active.

## Phase 2 — answer worker requests

Maintain expected `runId`, `sequence`, request ID, and next channel. For each
valid request:

1. parse the single protocol envelope;
2. verify it is the expected request;
3. read the exact answer from the approved scenario;
4. send one matching `QA_RESPONSE`;
5. record the request ID and response hash in the private receipt.

Do not answer from memory, nearby prose, browser state, or prior scenarios.
Do not add optional advice to a protocol response.

Persist the response before sending it and require the worker's
`response_accepted` acknowledgement. For `channel_begin`, do not resend the
response after acceptance. Require a persisted `verify_browser_binding` and
emitted `browser_binding_verified` for the selected browser and channel in the
current task turn before `browser_action_started`; this is an availability
probe only, not a runtime binding retained across acknowledgement. Require that start envelope
to contain the exact channel, browser, bounded action label, SHA-256
`actionHash`, and `timeoutMs:60000`. Apply `start_browser_action` to persist
`start_persisted`, then apply `authorize_browser_action_start`. That transition
must use the private active-task identity and durable action state to compute
and persist the canonical target lease hash before sending one matching
`QA_CHECKPOINT_ACK` with `targetLeaseHash`; never place the task identity in
the envelope. The manager acknowledgement is the worker's only authority to
invoke the browser, and the worker must exact-copy and compare that hash first;
commentary is never sufficient. Issue it only with:

```sh
node scripts/browser-acceptance/qa-recovery.mjs issue-ack \
  --state .social-metadata/qa/manager-runs/<run-id>-state.json
```

Persist the single-use acknowledgement issuance state only through this
command. It writes the state atomically before writing only the sanitized
envelope to stdout. Before reading state it enters the same state-path-scoped
exclusive mutation boundary used by every reducer `apply` and both issuance
commands. The opaque claim contains only a schema version and random nonce.
Issuance either commits before a conflicting terminal/recovery transition or
observes that transition and returns empty stdout; no stale read may erase a
terminal transition or restore consumed authorization. Exactly one issuer can
win; all losers return empty stdout. It releases its
verified claim only after `issued` is durable and before stdout. Contenders may
wait for verified release, but a crash, stale claim, persistence uncertainty,
or uncertain ownership is non-replayable: never delete, expire, steal, or
retry through the claim. Send the exact winner output.
Reject a second issuance, issuance after task termination, and regeneration
after manager recovery; never resend the acknowledgement; uncertain delivery
is `ambiguous_browser_action`. After
acknowledgement and exact hash comparison, require the worker to resolve the
exact selected host binding again in that same continuation and immediately
invoke `tabs.new` without commentary, a protocol event, a manager/worker
message, or any other intermediate worker output. Then require
`record_target_created` for that new plugin-owned agent tab at the channel's
typed official root with the exact persisted lease hash, followed by
`release_target` before
`browser_action_completed` and persisted-result checkpoints. Reject user-tab
listing, claiming, inspection, or reuse and reject any raw handle/ID in durable
state. If post-acknowledgement binding resolution or `tabs.new` fails, keep the
action `started` and stop as non-replayable `ambiguous_browser_action`; never
retry, re-acknowledge, or recover it from `not_created`. A recovered worker re-establishes and verifies the binding before
an unacknowledged action; task termination invalidates `binding_verified` and
`start_persisted`. It never repeats an accepted request, acknowledged/started
or completed action, or completed channel. A durable
`authentication_handoff` is the only recoverable started state: the old handle
is discarded, activation of the confirmed recovery task persists its new
canonical lease hash, and the manager durably issues one distinct sanitized
`QA_AUTHENTICATION_RECOVERY_LEASE` only with:

```sh
node scripts/browser-acceptance/qa-recovery.mjs issue-auth-recovery \
  --state .social-metadata/qa/manager-runs/<run-id>-state.json
```

The command atomically persists the recovery delivery's issued state before
writing only the sanitized envelope to stdout. It contains only protocol, run,
sequence, checkpoint, channel, and hash fields. Never resend the initial
acknowledgement or expose the private task identity. Require the recovery
worker to exact-copy and validate the supplied hash before creating a new
dedicated tab from the typed official root; reject a second recovery-envelope
issuance from saved state. Apply the identical opaque exclusive-claim,
empty-stdout loser, shared saved-state mutation boundary, and non-replayable
crash or stale-claim rules.

If the worker emits commentary without an envelope, wait. If it asks a
question without a valid envelope, stop as `unexpected_request`.

## Phase 3 — process channel outcomes

Check every result against the independent oracle and ordered channel list.
Process only the exact ordered channels in the scenario. Extra capability
channels in the oracle must never produce a request, browser action, outcome,
or receipt entry.
`ui_change` may be recorded and continued only when the scenario permits it.
`not_applicable` is valid for Pinterest hashtag without browser interaction.

Stop unattended execution on authentication, challenge, locale mismatch when
configured to stop, unsafe request, changed channel order, or oracle
contradiction. The manager may notify the user that manual action is needed,
but must not solicit or handle the secret.

## Phase 4 — close the run

Require one `run_complete` or `run_stopped` result. Verify:

- every reached channel has one outcome;
- skipped channels follow a recorded terminal interruption;
- prompt order, run isolation, and browser choice are represented;
- the receipt declares scenario and oracle IDs, scenario checksum,
  `answerSource: qa_scenario`, human presence, and preexisting-auth status;
- private artifacts remain ignored and uncommitted;
- product source remains unchanged.
- one-time browser authorization was consumed by the terminal transition;
- no second terminal result or recovery task was created;
- task and continuation history never show two active identities.

Return `pass`, `pass_with_findings`, `blocked`, or `fail` using the worker
runbook disposition rules. A truthful authentication stop is `blocked`, not a
product failure. A worker asking the manager for credentials is `fail`.
