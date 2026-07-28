# Browser acceptance

Browser acceptance is a user-visible checklist adapter, not a scraper. The host
performs only the bounded interactions in the channel playbook and passes
semantic outcomes to the harness:

```sh
node scripts/browser-acceptance/run.mjs \
  --input @sanitized-checklist.json \
  --output docs/browser-acceptance/receipts/youtube-public.json
```

Tracked receipts contain only channel/module, host/browser, locale, semantic
checkpoint states, bounded interaction status, and the screenshot policy. They
must never contain credentials, cookies, account identifiers, private creative
assets, URLs containing queries, raw DOM, or screenshot paths. If a screenshot
is needed for authentication/challenge or UI change, keep it in private
`.social-metadata/acceptance/screenshots/`; only the boolean policy result is
recorded.

Public acceptance is limited to Codex in-app Browser on TikTok, YouTube, and
Pinterest search terms (Pinterest hashtags are not applicable). Authenticated
acceptance uses user-controlled Chrome. Claude uses Claude in Chrome only and
requires a direct Anthropic login; unavailable capability is an explicit
interruption.

`npm run verify:release -- --allow-missing-live-receipts` verifies the harness
and release stack before dogfooding. The final command without that flag
requires fresh passing public and authenticated receipts. A loading or locator
failure is `ui_change`, never native empty.
