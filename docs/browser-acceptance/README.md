# Browser acceptance

Browser acceptance is a user-visible checklist adapter, not a scraper. The host
performs only the bounded interactions in the channel playbook and passes
semantic outcomes to the harness:

```sh
node scripts/browser-acceptance/run.mjs \
  --input @sanitized-checklist.json \
  --output docs/browser-acceptance/receipts/youtube-public.json
```

Before opening the first channel, ask the user to choose Chrome or the Codex
in-app Browser and record that confirmed choice in the run plan. Reuse the same
host browser binding while the choice remains effective. Before every channel,
read the effective selection from the CLI next action; if that surface is not
allowed for the channel, pause for a user-confirmed browser amendment before
continuing. Never treat an ambient browser window as the user's selection.

Tracked receipts contain only channel/module, host/browser, locale, semantic
checkpoint states, bounded interaction status, and the screenshot policy. They
must never contain credentials, cookies, account identifiers, private creative
assets, URLs containing queries, raw DOM, or screenshot paths. If a screenshot
is needed for authentication/challenge or UI change, keep it in private
`.social-metadata/acceptance/screenshots/`; only the boolean policy result is
recorded.

Authenticated acceptance must attach to the user's existing Chrome profile. A
temporary Playwright launch, profile-less Chromium instance, downloaded test
browser, or persisted automation profile is not a supported acceptance
surface. The browser may be automated through the host's browser-control
facility, but it must remain the host-managed, user-visible session.

## Sanitized authentication preflight

Run authenticated preflight as one bounded browser-control operation. Inside
that operation, filter open targets to the expected channel origin and discard
all non-matches before constructing a result. Never return a complete open-tab
list, tab titles, tab URLs, or an unfiltered target collection to the agent or
CLI.

Inspect only the matched target's semantic structure. Never return or retain a
full authenticated DOM snapshot, raw HTML, `body` text, feed content, account
identifiers, or any other page content. The operation may return only this
minimal sanitized projection:

- structural booleans for target match, authentication required, challenge
  present, locale match, search landmark present, and results landmark present;
- a sanitized status code;
- the expected semantic landmark; and
- the observed semantic landmark.

Expected and observed landmarks must be short structural labels, not copied
page text. If no target matches, return false booleans and a sanitized
`target_unavailable` status without exposing the targets that were inspected.
If a required landmark is missing, return `ui_change`; never broaden the read
or substitute body text, feed content, or a DOM snapshot.

LinkedIn and Pinterest entry diagnostics use only these enumerated structural
values:

- LinkedIn routes: `linkedin_search`, `linkedin_authenticated_feed`; expected
  landmark: `linkedin_native_search_entry`; observed landmarks:
  `linkedin_native_search_entry` or `linkedin_authenticated_feed_navigation`.
- Pinterest routes: `pinterest_public_search`, `pinterest_personal_search`,
  `pinterest_business_hub`, `pinterest_root_after_search_redirect`; expected
  landmark: `pinterest_search_control`; observed landmarks:
  `pinterest_search_control`, `pinterest_business_hub`, or `pinterest_root`.

LinkedIn passes entry acceptance only when the native search entry is present.
Authenticated Feed/navigation without it is `ui_change`. Pinterest personal or
public search may pass when Search is present. Business Hub or a root route
after a search redirect without Search is `ui_change`, never challenge or
native empty. These labels describe semantic structure and are not selectors.

If the session is signed out, acceptance stops with
`authentication_required`. The user signs in manually in that same browser and
then tells the host to resume. The plugin never accepts or enters passwords,
one-time codes, cookies, tokens, or storage state.

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
