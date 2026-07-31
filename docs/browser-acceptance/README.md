# Browser acceptance

Browser acceptance is a user-visible checklist adapter, not a scraper. The host
performs only the bounded interactions in the channel playbook and passes
semantic outcomes to the harness:

```sh
node scripts/browser-acceptance/run.mjs \
  --input @sanitized-checklist.json \
  --output docs/browser-acceptance/receipts/youtube-public.json
```

For the recommended live smoke, use the
[single-task runbook](runbooks/qa-single-task.md), its saved
[starter](prompts/qa-single-task-starter.md), and the
[Chrome/Instagram example](scenarios/examples/chrome-instagram-single-task-autocomplete.yaml).

Before opening the first channel, ask the user to choose Chrome or the Codex
in-app Browser and record that confirmed choice in the run plan. Reuse the same
host browser binding while the choice remains effective. Before every channel,
read the effective selection from the CLI next action; if that surface is not
allowed for the channel, pause for a user-confirmed browser amendment before
continuing. Never treat an ambient browser window as the user's selection.
Establish and verify the selected host binding anew for every channel and
after every task or process boundary. This check happens before the durable
action-start checkpoint; a missing binding is
`browser_binding_unavailable`, not an ambiguous started action.
It is an availability probe only: its runtime object is not retained or relied
on across the manager acknowledgement boundary.
The worker next emits a hashed start intent with the fixed 60000 ms action
bound. It may call the browser only after the manager durably accepts that
intent and returns the matching `QA_CHECKPOINT_ACK`. A malformed or
unacknowledged start intent performs no browser work.

Tracked receipts contain only channel/module, host/browser, locale, semantic
checkpoint states, bounded interaction status, and the screenshot policy. They
may also contain the deterministic dedicated-target lease hash and lifecycle
enums. They must never contain credentials, cookies, account identifiers,
private creative assets, raw target handles or IDs, tab titles, current target
URLs, URLs containing queries, raw DOM, screenshots, or screenshot paths.
Authenticated acceptance prohibits screenshot capture, including for
authentication, challenge, or UI-change outcomes; record the structural
outcome instead.

Authenticated acceptance must attach to the user's existing Chrome profile. A
temporary Playwright launch, profile-less Chromium instance, downloaded test
browser, or persisted automation profile is not a supported acceptance
surface. The browser may be automated through the host's browser-control
facility, but it must remain the host-managed, user-visible session.

## Sanitized authentication preflight

After the canonical hashed action start is acknowledged and the copied
manager-supplied lease hash exact-matches, resolve the
exact selected host binding again in that same post-acknowledgement worker continuation.
Emit no
commentary, protocol event, manager/worker message, or other worker output
between that resolution and the immediate `tabs.new` call. Create one new agent
tab, navigate it only to the channel playbook's typed official root, and
perform the bounded lifecycle through mandatory release. The new tab is the
task-scoped plugin-owned target lease. A binding-resolution or `tabs.new`
failure after acknowledgement remains `started`, stops as
`ambiguous_browser_action`, and is never retried or re-acknowledged. Never
list, enumerate, claim, inspect, or reuse user tabs. Both Chrome and the Codex
in-app Browser use this agent-tab creation contract.

Keep the raw target handle in the host browser runtime and inspect only that
exact plugin-created target's semantic structure. Never return or retain the
handle, a target ID, current URL/title, full authenticated DOM snapshot, raw
HTML, `body` text, feed content, account identifiers, or any other page
content. The operation may return only this minimal sanitized projection:

- a deterministic SHA-256 task/channel lease hash and lifecycle enum;
- structural booleans for dedicated-target origin match, authentication required, challenge
  present, locale match, search landmark present, and results landmark present;
- a sanitized status code;
- an enumerated route class;
- the expected semantic landmark; and
- the observed semantic landmark.

Expected and observed landmarks must be short structural labels, not copied
page text. If the plugin-created target is lost, closed, or fails its expected
origin check, return false booleans and a sanitized `target_unavailable`
status without looking for a substitute tab. If a required landmark is
missing, return `ui_change`; never broaden the read or substitute body text,
feed content, or a DOM snapshot.

Facebook, Instagram, LinkedIn, and Pinterest entry diagnostics use only these
enumerated structural values:

- Facebook routes: `facebook_search`, `facebook_authenticated_shell`,
  `facebook_target_unavailable`; expected landmark:
  `facebook_native_search_entry`; observed landmarks:
  `facebook_native_search_entry`, `facebook_authenticated_navigation`, or
  `target_unavailable`.
- Instagram routes: `instagram_search`, `instagram_authenticated_shell`,
  `instagram_target_unavailable`; expected landmark:
  `instagram_native_search_entry`; observed landmarks:
  `instagram_native_search_entry`, `instagram_authenticated_navigation`, or
  `target_unavailable`.

- LinkedIn routes: `linkedin_search`, `linkedin_authenticated_feed`,
  `linkedin_target_unavailable`; expected landmark:
  `linkedin_native_search_entry`; observed landmarks:
  `linkedin_native_search_entry`, `linkedin_authenticated_feed_navigation`, or
  `target_unavailable`.
- Pinterest routes: `pinterest_public_search`, `pinterest_personal_search`,
  `pinterest_business_hub`, `pinterest_root_after_search_redirect`; expected
  landmark: `pinterest_search_control`; observed landmarks:
  `pinterest_search_control`, `pinterest_business_hub`, or `pinterest_root`.

Each semantic channel passes entry acceptance only when `targetMatched=true`
and its ready route's exact native search entry is present. Authenticated
navigation without the entry and unavailable targets are `ui_change`.
Pinterest personal or public search may pass when Search is present. Business
Hub or a root route after a search redirect without Search is `ui_change`,
never challenge or native empty. These labels describe semantic structure and
are not selectors.

When a target is matched and authenticated but its search entry is absent,
exactly one bounded recovery may activate an in-origin native Search navigation
control that was evidenced by the same structural projection. Repeat the exact
same projection after that one activation. Never guess a URL or selector,
inspect page text, broaden the target read, or attempt a second recovery.
Results landmarks are not required during preflight before a query interaction
begins; once an interaction begins, a missing results landmark is `ui_change`
unless the native surface explicitly reports an empty state.

If the session is signed out, acceptance stops with
`authentication_required` and an explicit `authentication_handoff`. The user
signs in manually in that same dedicated target and then tells the host to
resume. The live handle is retained only inside the same worker task. After a
task/process boundary the stale handle is discarded and a new dedicated target
is created from the typed official root; user tabs are never searched to
rediscover it. An ordinary started-but-incomplete action still fails closed as
`ambiguous_browser_action`. The plugin never accepts or enters passwords,
one-time codes, cookies, tokens, or storage state.

Release/finalize the dedicated target before browser action completion and a
normal `channel_complete` result. Explicit manual-authentication handoff is the
sole unreleased exception.

Public acceptance is limited to Codex in-app Browser on TikTok, YouTube, and
Pinterest search terms (Pinterest hashtags are not applicable). Authenticated
acceptance uses user-controlled Chrome. Claude uses Claude in Chrome only and
requires a direct Anthropic login; unavailable capability is an explicit
interruption.

`npm run verify:release -- --allow-missing-live-receipts` verifies the harness
and release stack before dogfooding. The final command without that flag
requires fresh passing public and authenticated receipts. A loading or locator
failure is `ui_change`, never native empty.

## QA manager and worker materials

Use these version-controlled materials for repeatable local Codex QA:

- [QA worker runbook](runbooks/qa-worker.md) — phased, step-by-step execution
  procedure and stop conditions.
- [QA manager runbook](runbooks/qa-manager.md) — interviews the user, writes an
  approved scenario, starts a fresh worker task, and supplies only
  predetermined answers.
- [Manager starter](prompts/qa-manager-starter.md) — directly executable entry
  point for a fresh product-repository manager task.
- [Worker dispatch prompt](prompts/qa-worker-dispatch.md) — versioned
  manager-to-worker handoff populated with run-specific paths and checksums.
- [Campaign dispatch addendum](prompts/qa-worker-campaign-dispatch.md) — used
  only for an issued bounded-campaign child; ordinary dispatches omit it.
- [Manager/worker protocol](protocol/manager-worker.md) — stable request,
  response, result, and stop envelopes for scenario-driven QA.
- [Channel matrix](channel-matrix.md) — channel/module checkpoints and allowed
  outcomes.
- [QA run-note template](templates/qa-run-note.md) — human-readable run record.
- [QA receipt template](templates/qa-receipt.v1.json) — sanitized
  machine-readable handoff.
- [QA manager configuration schema](schemas/qa-manager-config.schema.json) —
  project-local remembered QA worker repository contract.
- [QA manager run-state schema](schemas/qa-manager-run-state.schema.json) —
  durable sequence, action, result, continuation, retry, and one-time
  authorization checkpoints used by host recovery.
- [QA manager campaign-state schema](schemas/qa-manager-campaign-state.schema.json)
  — private atomic state for a fixed, revocable campaign of at most ten
  one-time child runs.
- [Detached child-grant schema](schemas/qa-campaign-child-grant.schema.json)
  — exact downstream authorization, never embedded in a scenario.
- [Scenario schema](schemas/qa-scenario.schema.json) and
  [oracle schema](schemas/qa-oracle.schema.json) — machine-readable contracts
  for interview output and independent browser-capability expectations.
- [Example scenario](scenarios/examples/chrome-all-channels-autocomplete.yaml)
  — a committed synthetic starting point that must be copied and approved
  before use.
- [Chrome capability oracle](oracles/chrome-authenticated-research.yaml) and
  [in-app capability oracle](oracles/in-app-public-research.yaml) — canonical
  browser capability maps. A scenario may select any nonempty ordered subset
  they advertise; extra oracle channels never enter the run.

The development repository owns the canonical protocol. A separate QA
repository contains only the pinned worker runbook, worker templates, source
commit/checksums, isolated run state, and QA artifacts. Run the manager and its
configuration interview from this development repository. It dispatches a
fresh worker task rooted in the QA repository. The manager resolves that Codex
project from the configured absolute repository path and supervises the task
with cursor-based, event-aware waits. A bounded wait timeout is only a
heartbeat; the manager does not use recurring automation, send status pings,
or report completion while the worker remains active.

The manager is the only task creator. It records every transition through
`scripts/browser-acceptance/qa-recovery.mjs`, reserves a deterministic
continuation lease before task creation, and allows exactly one host-recovery
continuation. An ambiguous task creation or browser action stops visibly
instead of being retried. Run the deterministic recovery suite with:

```sh
npm run test:qa-recovery
```

Approved private scenarios live under
`.social-metadata/qa/scenarios/` in this repository and are ignored by Git.
Worker run notes, receipts, screenshots, and browser run state live in the QA
repository and remain ignored by Git.

## Bounded QA browser campaigns

A campaign is an optional manager-only authorization layer; it never changes a
worker's browser contract. Its immutable scope is QA-only existing visible
Chrome, exactly Instagram → Facebook → LinkedIn, both modules,
`autocomplete_only`, and plugin-owned `new_agent_tab` targets. Private state
lives at
`.social-metadata/qa/manager-campaigns/<campaignId>-state.json` and is mutated
only with `scripts/browser-acceptance/qa-campaign.mjs`.

Activation requires the exact phrase
`APPROVE QA BROWSER CAMPAIGN <campaignId> <campaignScopeSha256> FOR 10 RUNS`.
Design approval is not activation. Each successful `issue-child-grant`
atomically and irrevocably burns one of ten slots before its sanitized grant
is written to stdout. Only one child may be active, and no later grant exists
until the prior run is terminal, its one-time browser authorization is
consumed, target release or terminal ambiguity is recorded, and the terminal
receipt hash is reconciled. There are no refunds, reissues, resends, or grant
recovery after ambiguous delivery.

If authorization machinery changes after some of those ten slots have already
been consumed, do not resume or repin the old campaign. Leave it suspended and
create one replacement with `qa-campaign.mjs create-replacement`, supplying
the validated predecessor state. The reducer derives `consumedBefore` from
that predecessor, rejects an active, empty, exhausted, invalid, or already
replacement predecessor, binds the predecessor identity and state hash into
the new scope hash, and exposes only `10 - consumedBefore` local grants. For a
four-run predecessor, activation therefore requires the new exact phrase
`APPROVE QA BROWSER CAMPAIGN <campaignId> <campaignScopeSha256> FOR 6 RUNS`,
and grants retain series ordinals five through ten. The old approval never
authorizes the replacement.

Authentication, challenge, user pause, unsafe input, host/action ambiguity,
release uncertainty, stale mutation ownership, or pin mismatch suspends new
grants. Resume requires
`RESUME QA BROWSER CAMPAIGN <campaignId> <campaignScopeSha256>`. Revocation
requires `REVOKE QA BROWSER CAMPAIGN <campaignId>` and is monotonic. Campaigns
expire no later than seven days after creation. Exact pins may advance only
between terminal children after Judge approval, exact QA repin, hash checks,
and offline/release verification; authorization machinery and immutable scope
cannot change.

The scenario marker contains exactly campaign ID and scope hash. Scenario and
oracle pins hash the original bytes before UTF-8 decoding or parsing; the
detached grant is exact-field and self-hashed (omitting only its own hash),
then must equal the durable active child and current pins. Its run-state-path
hash is rechecked at creation and terminal reconciliation.

Campaign state and grant envelopes contain only sanitized IDs, ordinals,
enums, timestamps, immutable object IDs, deterministic hashes, counts, and
booleans. They never contain browser/page content, raw target data,
credentials, account identity, task identity, URLs, titles, or browser state.

Open a fresh Codex task rooted in this repository and say:

```text
Follow docs/browser-acceptance/prompts/qa-manager-starter.md.
```

The prompt resolves the current product root and commit itself. It reads the
remembered QA worker repository from
`.social-metadata/qa/manager-config.json`, asks the user to choose and confirm
one when missing, and allows the saved choice to be amended. It also asks for
the manager mode, with `configure_and_run` as the recommended default.

Validate a scenario and oracle before dispatch:

```sh
npm run qa:scenario:validate -- \
  --scenario docs/browser-acceptance/scenarios/examples/chrome-all-channels-autocomplete.yaml \
  --oracle docs/browser-acceptance/oracles/chrome-authenticated-research.yaml
```

Add `--require-approved` only for a private scenario that has completed the
manager interview and explicit user approval. Committed examples are
intentionally unapproved and cannot authorize browser access.
