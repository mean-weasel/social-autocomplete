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
