# Single-task local browser QA

Runbook version: `1.0`. This is the recommended live smoke. One fresh Codex task owns the approved
scenario, installed plugin, CLI run, retained browser binding, plugin-created
tab, and receipt. Prove Chrome plus Instagram before adding channels.

## Boundaries

- Use the user's existing, visible Chrome session; never use standalone,
  temporary, headless, or profile-less Chromium.
- Never enumerate, claim, inspect, or reuse existing user tabs. Create one new
  plugin-owned Instagram tab at `https://www.instagram.com/`.
- Never handle credentials, cookies, tokens, storage state, account data, raw
  DOM, feed content, or screenshots.
- Never publish, enter a composer, scrape, crawl, or use private endpoints.
- Follow only the finite projections in the Instagram playbook.

## Procedure

1. Record the source revision, require a clean or explicitly accepted build,
   and run `npm run verify:release -- --allow-missing-live-receipts`.
2. Install that revision, then start the one fresh Codex task that will finish
   the live smoke; it creates no child task.
3. Copy the committed single-task example to `.social-metadata/qa/scenarios/`.
   Confirm its synthetic brief, locale, exact prefixes, and bounds.
4. After user approval, set `status: approved`, `approvedAt`, and
   `browserAccessAuthorized: true`; keep credentials false and reuse false.
5. Validate the scenario against the Chrome oracle with `--require-approved`.
6. Invoke Social Metadata Research and create its CLI plan before browser use.
   The approved scenario supplies the confirmed browser, ordered channel,
   modules, mode, bounds, and exact prefixes.
7. Connect to Chrome once and retain that binding across user turns. Reconnect
   only after an explicit browser-disconnected outcome.
8. From that binding, create the plugin-owned Instagram tab at the official
   root. Project the playbook's exact Search entry/navigation roles and permit
   its one bounded Search-navigation recovery.
9. If sign-in is required, retain the tab as a handoff, ask the user to sign in
   manually, and resume in this task. Never handle credentials.
10. Enter each configured prefix exactly. Read at most the configured number of
    candidates and only through the exact input's `aria-controls` or
    `aria-owns` popup. Missing or conflicting ownership is `ui_change`; do not
    broaden to page-global candidates.
11. Release the tab, record observations with `social-metadata
    record-observation`, and run `social-metadata validate`.
12. Write one ignored, sanitized note and receipt containing revision,
    scenario checksum, timestamps, locale, prefixes, counts, status, and
    structural failure labels—never handles, DOM, screenshots, credentials,
    account data, or query URLs.

There is no `QA_EVENT`, `QA_CHECKPOINT_ACK`, manager lease, campaign, timer, or cross-task recovery in this path.

## Result rule

The smoke passes only when every configured module captures at least one current native suggestion and CLI validation succeeds. `authentication_required`,
`challenge`, `browser_binding_unavailable`, `ui_change`, and
`validation_failed` are explicit non-passing outcomes.
