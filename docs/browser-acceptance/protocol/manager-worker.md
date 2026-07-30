# QA manager/worker protocol

Protocol version: `qa-manager-worker/v1`

This protocol lets one Codex manager task rooted in the product repository
drive a fresh QA worker task rooted in the dedicated QA repository from a
validated, user-approved scenario. It is deliberately small, visible, and
fail-closed. It is not a browser automation protocol and carries no browser
content.

## Envelope format

Every machine-significant message is one JSON object on one line. The prefix
is part of the protocol:

```text
QA_EVENT {"protocol":"qa-manager-worker/v1","type":"request","runId":"qa_example","sequence":1,"requestId":"browser_selection","payload":{"allowed":["chrome","in_app"]}}
```

The manager answers:

```text
QA_RESPONSE {"protocol":"qa-manager-worker/v1","runId":"qa_example","sequence":1,"requestId":"browser_selection","scenarioId":"chrome_all_channels_autocomplete","answer":{"browser":"chrome"}}
```

Before a browser action, the worker announces an exact bounded start intent:

```text
QA_EVENT {"protocol":"qa-manager-worker/v1","type":"result","runId":"qa_example","sequence":4,"resultId":"browser_action_started","payload":{"channel":"instagram","browser":"chrome","action":"bounded_autocomplete_research","actionHash":"<sha256>","timeoutMs":60000}}
```

After persisting that intent, the manager acknowledges it:

```text
QA_CHECKPOINT_ACK {"protocol":"qa-manager-worker/v1","runId":"qa_example","sequence":4,"checkpointId":"browser_action_started","channel":"instagram","actionHash":"<sha256>","timeoutMs":60000,"targetLeaseHash":"<sha256>"}
```

The worker must not call the browser before receiving this exact matching
acknowledgement. The manager is the sole authority for `targetLeaseHash`: it
computes the hash from durable run state and the private active-task identity,
persists it before acknowledgement, and exposes only the sanitized hash. The
worker must neither invent nor recompute it. Before browser invocation, the
worker must require the field, copy it without transformation into its local
action context, and exact-compare that copy with the acknowledgement. Missing,
malformed, or unequal values stop the run before browser access. Manager prose
is never an acknowledgement.
Initial acknowledgement issuance is a durable single-use transition. The
manager must run `qa-recovery.mjs issue-ack --state <run-state>` and send only
its sanitized stdout envelope. The operation atomically persists
`acknowledgementState:"issued"` before emitting stdout. A second issuance
attempt from saved state, an attempt after the worker task becomes terminal, or
an attempt after manager recovery fails closed without output. Delivery
uncertainty remains `ambiguous_browser_action`; the initial acknowledgement is
never regenerated or resent.
Before reading or mutating run state, the command enters the same exclusive
opaque saved-state mutation boundary used by `apply` and both issuance
commands. This makes terminal, recovery, and issuance transitions
linearizable: issuance either commits before a later transition, or observes
that transition and fails closed with empty stdout. The claim is scoped only
to the state path and contains only its schema version and a random nonce,
never task identity, target identity, browser metadata, or run state. The
winner persists `issued`, releases its verified claim, and only then emits the
envelope. Contenders may wait only for the current verified owner to release;
the claim is never expired, stolen, deleted by a loser, or otherwise taken
from that owner. A crash, persistence uncertainty, stale claim, or uncertain
claim ownership leaves the claim in place and eventually fails contenders
closed; it is never treated as permission to replay.
`actionHash` is the SHA-256 of the UTF-8 compact JSON descriptor with this
exact key order:

```json
{"action":"bounded_autocomplete_research","browser":"chrome","channel":"instagram","timeoutMs":60000,"targetAcquisition":"new_agent_tab","targetOfficialRoot":"https://www.instagram.com/","targetOwnership":"plugin_owned"}
```

The manager reducer supplies the typed official root and fixed target fields
from the declared channel, then recomputes this hash before it persists or
acknowledges the start intent.

Results use the same event prefix:

```text
QA_EVENT {"protocol":"qa-manager-worker/v1","type":"result","runId":"qa_example","sequence":8,"resultId":"channel_complete","payload":{"channel":"facebook","status":"ready"}}
```

Interruptions are results, never answerable credential prompts:

```text
QA_EVENT {"protocol":"qa-manager-worker/v1","type":"interruption","runId":"qa_example","sequence":9,"resultId":"authentication_required","payload":{"channel":"instagram","resumeSupported":true}}
```

Payloads must contain only contract enums, booleans, counts, IDs created for
the QA run, deterministic hashes, the typed public official root when target
creation is being validated, and sanitized structural labels. They must not
contain creative text, suggestions, page text, current target URLs, raw browser
target handles/IDs, tab titles, account identifiers, DOM, screenshots,
credentials, tokens, or storage state.

## Transport and liveness

Protocol envelopes travel through the Codex task-messaging transport. Task
identities, host IDs, cursors, manager wait durations, and transport timeout
metadata belong only to manager coordination state and must not be copied into
a protocol envelope, worker receipt, or tracked artifact. The fixed
`timeoutMs:60000` browser-action bound is part of the sanitized action
descriptor, not transport metadata.

The manager is the only task creator. A bootstrap worker that installs the
plugin must emit a `worker_handoff` result with reason
`post_install_fresh_task`; it must not create the required fresh task itself.
The manager persists the handoff, closes the bootstrap task, reserves a
continuation lease, and then creates the post-install execution task.

The manager supervises one worker with cursor-based, event-aware waits bounded
to approximately 60 seconds. A transport wait timeout is a local manager
heartbeat only. It is not a `QA_EVENT`, does not imply that the worker is
stalled, and must never be converted into `run_complete` or `run_stopped`.
After a timeout the manager waits again without sending a status ping. New
worker output advances the cursor so previously processed envelopes are not
handled twice.

## Durable checkpoints and host recovery

Before dispatch, the manager creates ignored project-local state conforming to
`schemas/qa-manager-run-state.schema.json`. Every transition is applied through
`scripts/browser-acceptance/qa-recovery.mjs`; `apply`, `issue-ack`, and
`issue-auth-recovery` share one state-path-scoped exclusive mutation boundary,
and state is persisted atomically before the corresponding external send,
browser action, result emission, or task creation. No stale read can overwrite
a committed terminal/recovery transition or restore consumed authorization.
The state path is deterministic for the run and `create` refuses to overwrite
it. The one-time authorization ID is derived from the run ID, so a terminal
record cannot be reset or repurposed as a fresh run.

The state preserves the exact run ID, scenario/oracle/protocol IDs and hashes,
browser, ordered channels, one-time authorization ID, next sequence, completed
channels, response and result hashes, active task, continuation lease, and the
manager-computed canonical target lease hash.
Response checkpoints are `persisted`, `sent`, and `accepted`. A
`channel_begin` action is separately `authorized`, `binding_verified`,
`start_persisted`, `started`, and `completed`. Its dedicated target is
`not_created`, `created`, `authentication_handoff`, `recreation_required`, or
`released`.
A result is `persisted` before it is `emitted`.

The worker acknowledges each accepted response through a sanitized
`response_accepted` event before browser work. While the action is still only
`authorized`, it establishes the selected host browser binding for the current
task turn, persists `verify_browser_binding`, and emits
`browser_binding_verified` with the selected browser, channel, and a sanitized
binding-check hash. It must repeat this verification for every channel and
after every task or process boundary; prior verification is invalidated by a
host continuation. This verification is an availability probe only; its
runtime binding is neither retained nor relied on across manager
acknowledgement. Only then may the worker emit `browser_action_started` with
the SHA-256 of its sanitized action descriptor and `timeoutMs:60000`. The
manager applies `start_browser_action`, which records `start_persisted`, then
applies `authorize_browser_action_start`, which derives and durably stores the
canonical task-scoped target lease hash before sending one exact
`QA_CHECKPOINT_ACK` containing that hash. Only after receiving the matching
acknowledgement and exact-comparing its copied `targetLeaseHash` may the worker
invoke the browser. The manager's conservative `started` state therefore
precedes the external browser call. In that same post-acknowledgement worker
continuation, the worker resolves the exact selected host binding again and,
without commentary, a protocol event, a manager/worker message, or any other
intermediate worker output, immediately invokes `tabs.new` on it. The worker
then navigates only to the channel's typed official root, keeps the raw binding
and handle in the host runtime, and records `record_target_created` with the
unchanged manager-supplied lease hash. The reducer compares it with the
persisted canonical value. A post-acknowledgement binding-resolution or
`tabs.new` failure remains `started`, stops as `ambiguous_browser_action`, and
cannot be retried, re-acknowledged, or recovered from `not_created`. It never
lists, claims, inspects, or reuses user tabs.
If acknowledgement delivery or manager
state becomes uncertain after that transition, the run stops as
`ambiguous_browser_action`; the manager never resends the acknowledgement. The
worker records `release_target` before it durably stores the sanitized outcome
and records `browser_action_completed` with its hash. Action completion is
rejected unless target lifecycle is `released`. It
persists the channel result from that stored outcome before emitting it. These
checkpoint events contain only run IDs, sequence numbers, enumerated
channel/action labels, bounded timeout, and hashes; they never contain browser
or page content.

After a terminal host failure, only the manager may reserve and create a
recovery continuation. The retry limit is exactly one recovery continuation
after the post-install execution task. Recovery is allowed only when the old
task is terminal and the durable checkpoint is unambiguous:

- a persisted response may be sent or accepted without recomputing it;
- an accepted `channel_begin` whose action is `authorized`,
  `binding_verified`, or `start_persisted` may continue without resending or
  reauthorizing the request, but a task boundary invalidates the binding and
  any unacknowledged start intent before starting again;
- a completed action may proceed to result persistence without repeating it;
- a persisted result may be emitted without repeating the action or channel;
- a completed channel advances only to the next selected channel.

An action at `started` without durable `completed` is
`ambiguous_browser_action` and stops, except when the target was durably marked
`authentication_handoff` before the task ended. That one explicit state becomes
`recreation_required`; after activating the confirmed recovery task, the
manager derives and persists its new task-scoped lease hash in the durable
checkpoint, then runs
`qa-recovery.mjs issue-auth-recovery --state <run-state>`. The operation
atomically persists `recoveryLeaseDeliveryState:"issued"` before emitting only
this separate single-use sanitized stdout envelope:

```text
QA_AUTHENTICATION_RECOVERY_LEASE {"protocol":"qa-manager-worker/v1","runId":"qa_example","sequence":4,"checkpointId":"authentication_recovery_target","channel":"instagram","targetLeaseHash":"<sha256>"}
```

This is not a resent `QA_CHECKPOINT_ACK` and contains no task identity, target
handle, or private manager state. The recovery worker must reject every
missing, extra, malformed, or mismatched field and exact-copy the supplied hash
before it creates a new agent tab from the typed official root. A second
recovery-envelope issuance from saved state, including after manager recovery
or task/run terminal state, fails closed without output. It must never
reuse a stale handle or rediscover a user tab. The same shared saved-state
mutation boundary, empty-stdout loser, and non-replayable crash or stale-claim
rules apply. A
same-task manual sign-in
retains and resumes the exact live handle. The manager persists a deterministic
continuation lease as `reserved`, then persists `creating` immediately before
the one external task-creation call. Only that `creating` lease may be
activated with the returned task identity. If the manager restarts with an
unresolved `creating` lease, or creation may have succeeded but no task
identity was returned, it is `continuation_creation_ambiguous` and stops; the
manager never creates another task. A second host failure exhausts the
single recovery attempt and emits one `run_stopped` with reason
`worker_host_unavailable`, `blockingProductFinding:false`, and
`resumeSupported:false`.

Terminal transition consumes the run's one-time browser authorization.
Repeated terminal processing returns the existing terminal record and may not
emit a second terminal result.

`run_complete` may report `pass`, `pass_with_findings`, or `fail`. A `fail`
terminal is valid only with `blockingProductFinding:true`; passing terminals
must omit that field or set it to `false`. Every complete disposition still
requires all selected channel results to be durably emitted, closes active
coordination, and consumes the one-time browser authorization.

## Worker requests

The worker may request only:

| Request ID | Answer source | Required answer |
| --- | --- | --- |
| `browser_selection` | `scenario.browser` | One confirmed browser |
| `ordered_channel_selection` | `scenario.channels` | Exact ordered channel list |
| `plan_confirmation` | Scenario fields | Scope, locale, modules, tier, mode, bounds |
| `channel_begin` | Scenario plus current run state | Exact next channel and confirmed browser |

The expected startup order is browser, ordered channels, then plan. One
`channel_begin` request follows for each channel not skipped by an earlier
terminal interruption.

A capability oracle may advertise channels that the scenario did not select.
Those extra channels are not part of the run. The manager and worker must use
the exact `scenario.channels` array, in its recorded order, as the exclusive
source for `ordered_channel_selection`, `channel_begin`, browser actions,
results, and receipt entries. Oracle order is never authoritative.

The manager must reject duplicate or out-of-order sequence numbers, a changed
run ID, a mismatched request ID, and any answer not represented exactly in the
validated scenario. It must never answer a request by inferring from worker
prose.

## Worker results

The worker emits:

- `worker_handoff` after installation when a genuinely fresh task is required;
- `response_accepted` after durably accepting a manager response;
- `browser_binding_verified` after `verify_browser_binding` is durably
  persisted for the selected channel and task turn, before the action-start
  checkpoint;
- `browser_action_started` with `actionHash` and `timeoutMs:60000` before the
  manager acknowledgement; `target_created` and `target_released` lifecycle
  results around one bounded authorized channel action; and
  `browser_action_completed` only after release;
- `channel_complete` after every completed channel, including a truthful
  `ui_change` or `not_applicable` result;
- `authentication_required`, `challenge`, `locale_mismatch`, or
  `unsafe_request` when continuation requires a person or violates policy;
- `run_complete` exactly once when no terminal interruption occurred;
- `run_stopped` exactly once after a terminal interruption.

`ui_change` is non-terminal only when the scenario says
`record_and_continue`. Authentication and challenge are always terminal for an
unattended run. A manager may report that a human is needed, but may not sign
in, click through a challenge, or ask the worker to do so.

## Stop rules

The manager stops without answering when:

- the scenario is missing, invalid, unapproved, expired, or is incompatible
  with the selected capability oracle;
- `requireHumanBeforeBrowserAccess` is true and no human has explicitly
  released the run;
- the worker emits an unknown request or asks for credentials, codes, cookies,
  tokens, account identity, private content, broad browser data, publishing, or
  composer interaction;
- the worker response sequence, run ID, scenario ID, or channel order diverges;
- the worker requests, researches, reports, or records a channel omitted from
  the scenario;
- authentication, challenge, or another interruption marked `stop` occurs;
- a result contradicts a canonical oracle invariant.

The final manager report distinguishes `blocked` external prerequisites from a
`fail` contract violation.

## Human-action resume

An unattended run never resumes itself after authentication or challenge.
After the user completes the manual action in the same selected browser, the
manager may start a new attended continuation against the same product run ID.
The receipt must record the transition from unattended to attended and may no
longer claim that no human was present. This explicit human-action path is
separate from host recovery and requires fresh browser authorization when the
prior run already reached a terminal result.
