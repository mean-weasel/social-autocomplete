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

Results use the same event prefix:

```text
QA_EVENT {"protocol":"qa-manager-worker/v1","type":"result","runId":"qa_example","sequence":8,"resultId":"channel_complete","payload":{"channel":"facebook","status":"ready"}}
```

Interruptions are results, never answerable credential prompts:

```text
QA_EVENT {"protocol":"qa-manager-worker/v1","type":"interruption","runId":"qa_example","sequence":9,"resultId":"authentication_required","payload":{"channel":"instagram","resumeSupported":true}}
```

Payloads must contain only contract enums, booleans, counts, IDs created for
the QA run, and sanitized structural labels. They must not contain creative
text, suggestions, page text, URLs, browser target metadata, account
identifiers, DOM, screenshots, credentials, tokens, or storage state.

## Transport and liveness

Protocol envelopes travel through the Codex task-messaging transport. Task
identities, host IDs, cursors, wait durations, and timeout metadata belong only
to manager coordination state and must not be copied into a protocol envelope,
worker receipt, or tracked artifact.

The manager supervises one worker with cursor-based, event-aware waits bounded
to approximately 60 seconds. A transport wait timeout is a local manager
heartbeat only. It is not a `QA_EVENT`, does not imply that the worker is
stalled, and must never be converted into `run_complete` or `run_stopped`.
After a timeout the manager waits again without sending a status ping. New
worker output advances the cursor so previously processed envelopes are not
handled twice.

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

The manager must reject duplicate or out-of-order sequence numbers, a changed
run ID, a mismatched request ID, and any answer not represented exactly in the
validated scenario. It must never answer a request by inferring from worker
prose.

## Worker results

The worker emits:

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

- the scenario is missing, invalid, unapproved, expired, or does not match the
  oracle;
- `requireHumanBeforeBrowserAccess` is true and no human has explicitly
  released the run;
- the worker emits an unknown request or asks for credentials, codes, cookies,
  tokens, account identity, private content, broad browser data, publishing, or
  composer interaction;
- the worker response sequence, run ID, scenario ID, or channel order diverges;
- authentication, challenge, or another interruption marked `stop` occurs;
- a result contradicts a canonical oracle invariant.

The final manager report distinguishes `blocked` external prerequisites from a
`fail` contract violation.

## Resume

An unattended run never resumes itself after authentication or challenge.
After the user completes the manual action in the same selected browser, the
manager may start a new attended continuation against the same product run ID.
The receipt must record the transition from unattended to attended and may no
longer claim that no human was present.
