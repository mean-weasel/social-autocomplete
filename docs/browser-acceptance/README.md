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

## QA agent materials

Use these version-controlled materials for repeatable local Codex QA:

- [QA agent runbook](qa-agent-runbook.md) — phased, step-by-step execution
  procedure and stop conditions.
- [QA manager runbook](qa-manager-runbook.md) — interviews the user, writes an
  approved scenario, starts a fresh worker task, and supplies only
  predetermined answers.
- [Manager/worker protocol](manager-worker-protocol.md) — stable request,
  response, result, and stop envelopes for scenario-driven QA.
- [Channel matrix](channel-matrix.md) — channel/module checkpoints and allowed
  outcomes.
- [QA run-note template](templates/qa-run-note.md) — human-readable run record.
- [QA receipt template](templates/qa-receipt.v1.json) — sanitized
  machine-readable handoff.
- [Scenario schema](schemas/qa-scenario.schema.json) and
  [oracle schema](schemas/qa-oracle.schema.json) — machine-readable contracts
  for interview output and independent expectations.
- [Example scenario](scenarios/examples/chrome-all-channels-autocomplete.yaml)
  and [its independent oracle](oracles/chrome-all-channels-autocomplete.yaml) —
  committed synthetic starting points that must be copied and approved before
  use.

The development repository owns the canonical protocol. A separate QA
repository should contain a pinned copy plus the source commit and checksum
used for the run. Private run notes, receipts, screenshots, and
`.social-metadata/` state remain outside the product repository and ignored by
Git.

Validate a scenario and oracle before dispatch:

```sh
npm run qa:scenario:validate -- \
  --scenario docs/browser-acceptance/scenarios/examples/chrome-all-channels-autocomplete.yaml \
  --oracle docs/browser-acceptance/oracles/chrome-all-channels-autocomplete.yaml
```

Add `--require-approved` only for a private scenario that has completed the
manager interview and explicit user approval. Committed examples are
intentionally unapproved and cannot authorize browser access.
