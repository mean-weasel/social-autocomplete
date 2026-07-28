# Social Metadata Research

Browser-first social metadata research for Codex, Claude, and JSON subprocess
consumers. The host controls a user-visible browser and interprets creative
context; this package records plans and observations and validates evidence.

Version 1 researches `search-term` and `hashtag` metadata on Facebook,
Instagram, LinkedIn, X, TikTok, YouTube, and Pinterest. Pinterest hashtags are
explicitly not applicable. The CLI does not publish, interact with composers,
scrape pages, or depend on provider APIs, Buffer, GrowthOps, or Lineage.

## Core CLI

```sh
npm ci
npm run build
social-metadata plan --json @request.json
social-metadata record-observation --run run_example --json @observation.json
social-metadata validate --run run_example
```

All commands are non-interactive and emit exactly one versioned JSON object on
stdout. Diagnostics belong on stderr. Exit codes distinguish invalid contracts
(`2`), incomplete research (`3`), resumable authentication or challenge pauses
(`4`), platform UI changes (`5`), and locale/environment mismatches (`6`).

Run state is private and resumable under `.social-metadata/`. On first use in a
Git repository, the CLI adds that directory to `.git/info/exclude` without
changing the tracked `.gitignore`.

Autocomplete order is captured only to reproduce the visible native surface. It
is not evidence of popularity, performance, or future reach.

## Browser sessions and authentication

Browser selection is the first required step of every run. The user explicitly
chooses either `chrome` (their existing visible Chrome session) or `in_app`
(the Codex built-in Browser). The confirmed choice is stored in the plan:

```json
{
  "browserSelection": {
    "browser": "chrome",
    "confirmedByUser": true
  }
}
```

Every CLI next action repeats the effective selection. A user-confirmed change
is recorded through an append-only plan amendment and applies before the next
channel-native evidence is captured. The plugin never silently changes browser
surfaces. The in-app Browser is limited to playbook-approved public research;
Chrome is required for Facebook, Instagram, LinkedIn, X, and authentication.

The plugin does not create a temporary Playwright or profile-less Chromium
session. Authenticated research uses the user's existing, visible Chrome
profile so the channel can use sign-ins the user has already completed.

If a requested channel is signed out, the plugin preserves the current run,
returns an `authentication_required` interruption, and asks the user to sign in
manually in that same browser. After the user confirms readiness, the plugin
re-verifies the channel and resumes the same run.

Neither the plugin nor the CLI asks for, types, reads, transmits, or stores
passwords, one-time codes, cookies, access tokens, browser storage state, or
account identifiers. The Codex in-app Browser may be used only for public
surfaces permitted by the channel playbook; it is host-managed and is not a
standalone Chromium fallback.

## Plugin and integration checks

The repository root is one self-contained Codex and Claude plugin. Invoke
`social-metadata-research` naturally or directly in either host, then choose
guided or automatic orchestration after confirming the inferred research plan.

```sh
npm run verify:offline
npm run example:subprocess
```

The offline suite replays all channels, both modules and evidence tiers,
guided/automatic modes, interruption/resume paths, stale and locale failures,
zero outcomes, and Pinterest hashtag `not_applicable`. See
`docs/integration/json-contract.md` for subprocess consumption.
