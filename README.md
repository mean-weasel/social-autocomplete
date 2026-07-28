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
