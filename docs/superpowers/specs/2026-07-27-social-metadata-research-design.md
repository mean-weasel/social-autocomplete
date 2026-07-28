# Social Metadata Research Plugin and CLI Design

**Status:** Approved design
**Date:** 2026-07-27
**Repository:** `social-autocomplete`

## Summary

Build a standalone, browser-first social metadata research system for Codex and Claude. A shared, non-interactive CLI owns plans, durable state, evidence validation, and versioned JSON receipts. Host plugins own conversation, creative-context interpretation, browser control, and contextual recommendations.

Version one researches two independent metadata modules:

- `search-term`
- `hashtag`

The system researches Facebook, Instagram, LinkedIn, X, TikTok, YouTube, and Pinterest. Pinterest supports `search-term` and returns an explicit module-level `not_applicable` result for `hashtag`.

The primary evidence source is channel-native search in a user-controlled browser. Authenticated work uses Chrome. Public surfaces may use the Codex in-app browser where the channel playbook permits it. Claude uses its available browser-control integration while following the same playbook and evidence contract.

The plugin never launches or falls back to a standalone, temporary, or profile-less Playwright/Chromium instance. Authenticated work attaches to the user's existing visible browser profile. If the channel is signed out, the run pauses while the user signs in manually in that same browser and resumes only after confirmation. The plugin never receives or enters credentials.

The system does not publish, enter composers, scrape pages, store credentials, or depend on Buffer, GrowthOps, provider APIs, paid access, or another repository.

## Goals

1. Let a Codex or Claude user provide creative context such as a caption, image, app, or collection of messaging material.
2. Have the host assistant reduce that material to a normalized creative brief.
3. Research ordinary search terms and hashtags on user-selected social channels.
4. Support a fast autocomplete-only workflow and an optional bounded result-inspection workflow.
5. Preserve exact query prefixes, visible suggestions, relevance observations, selected and rejected candidates, and justified zero outcomes.
6. Produce timestamped, locale-specific receipts that another repository can consume through a stable subprocess JSON contract.
7. Make authentication interruptions and platform UI changes visible and resumable.
8. Support independent dogfooding, fixture replay, selector-change diagnostics, and live browser acceptance.
9. Keep module schemas isolated so later metadata modules cannot contaminate `search-term` or `hashtag`.

## Non-goals

Version one does not:

- Publish, schedule, draft, or modify social posts.
- Enter or interact with any channel composer.
- Automatically revise captions, titles, or other creative material as part of the certified research run.
- Crawl, scrape, enumerate hidden DOM state, intercept private endpoints, or scroll without a plan-defined bound.
- Claim that autocomplete order proves popularity, reach, performance, or future results.
- Require or integrate Buffer, GrowthOps, Lineage, or another product.
- Require provider credentials, paid data, or social APIs.
- Store browser cookies, storage state, passwords, access tokens, or account identifiers.
- Research sounds, mentions, accounts, locations, captions, titles, or descriptions as certified modules.
- Provide a hosted service, database, dashboard, or browser extension.

After a run, the user may separately ask Codex, Claude, or an integrating tool to revise content using the research. That follow-up is outside this plugin's certified receipt.

## Core terminology

- **Host:** Codex or Claude, which owns user conversation, creative interpretation, browser interaction, and contextual selection.
- **Run:** One multi-channel research session based on one normalized creative brief.
- **Channel run:** The atomic research step for one channel within a run.
- **Module:** An isolated research domain with its own plan, observation payloads, reducer, validator, and receipt result.
- **Evidence tier:** The level of native browser evidence collected for a module result.
- **Observation:** One timestamped piece of browser-native evidence.
- **Receipt:** The validated, machine-readable result for a channel run.
- **Researched recommendation:** A host-selected candidate that is supported by exact native evidence.
- **Model suggestion:** A host-inferred idea that lacks exact native evidence and is kept outside researched recommendations.

## Product experience

### Invocation and intake

Users may invoke the capability in either of two ways:

- Natural language, such as "research metadata for this post."
- A direct Codex or Claude plugin call.

Before the host normalizes or submits a plan, the user explicitly chooses the
browser surface. Codex offers `chrome` (the user's existing visible Chrome
session) and `in_app` (the Codex built-in Browser). The choice is recorded in
the plan, repeated in every next action, and remains in force until the user
confirms an append-only amendment. The host never silently substitutes a
different browser.

Codex or Claude inspects the supplied caption, image, app, files, or messaging fragments and creates a normalized creative brief. The CLI accepts that brief; it does not implement image, application, or document interpretation.

Project-local run state stores the normalized brief and safe references to original inputs. It does not copy source assets into the run.

The user may supply a channel list or ask the host to propose one. Before research begins, the host presents and requires confirmation of:

- The normalized creative brief.
- The final ordered channel list.
- Inferred locale.
- Inferred target market or region.
- Orchestration mode.
- Default evidence tier.
- Any requested channel-specific evidence-tier overrides.
- The user-confirmed browser choice and its channel compatibility.

### Orchestration modes

The user chooses an orchestration mode on every run.

#### `guided`

`guided` is the default. For each channel:

1. The host proposes exact ordinary search-term prefixes.
2. The user approves or edits them.
3. The host researches search-term autocomplete.
4. The host uses supported search-term findings as possible hashtag seeds.
5. The host proposes exact hashtag prefixes.
6. The user approves or edits them.
7. The host researches hashtag autocomplete.
8. The host performs result inspection when configured.
9. The host returns the channel receipt before proceeding.

#### `automatic`

The user confirms the overall brief, ordered channels, locale, target market, modules, and evidence tier once. The host then:

1. Derives and runs search-term prefixes.
2. Uses supported search terms to derive hashtag prefixes.
3. Performs one bounded refinement round when necessary.
4. Completes the configured result inspection.
5. Returns results after each channel without further query approvals.

Authentication, browser challenges, and unexpected UI changes still pause automatic runs because the host must not bypass them.

### Modules and defaults

Both v1 modules are enabled by default:

- `search-term`
- `hashtag`

The user or calling tool may deselect either module. Pinterest runs `search-term` and produces a successful `not_applicable` result for `hashtag`.

Search-term findings may seed hashtag planning within the same channel. Findings from an earlier channel may seed later-channel plans, but a candidate must receive independent native evidence on every channel where it is recommended.

### Evidence tiers

#### `autocomplete_only`

`autocomplete_only` is the default and is a successful, consumable evidence tier. The host:

- Enters exact planned prefixes.
- Captures the visible native suggestions.
- Selects contextually relevant candidates.
- Records selected and rejected candidates with rationales.

Autocomplete display position is retained to reproduce what was visible. It is never interpreted as popularity or performance.

#### `results_sample`

`results_sample` includes the autocomplete workflow and then searches every candidate the host intends to recommend. For each recommendation, the host:

- Inspects a bounded set of visible native results.
- Classifies topical relevance.
- Records a short relevance rationale.
- Opportunistically records visible engagement when the platform exposes it.

Visible engagement is descriptive and non-representative. Its absence never invalidates a sample, and it cannot support a future-performance claim.

### Refinement and zero outcomes

When initial prefixes yield no useful candidates, the host may perform one bounded refinement round:

- In guided mode, the user approves the revised prefixes.
- In automatic mode, the host records and executes the revised plan without another approval.

If the refinement also yields no supported recommendation, the module returns a successful, justified `zero` outcome. It does not expand indefinitely.

Authentication, locale mismatches, browser challenges, and changed UI can never be represented as zero results.

### Incremental results and follow-up

The host returns a result after each channel completes. By default, it includes:

- A concise set of contextual recommendations.
- The underlying native observations and provenance.

Callers may request recommendations-only or evidence-only output views without changing the stored receipt.

The plugin stops after research. A user may then separately ask the host or another tool to update a caption, title, or post using the receipt.

## Repository architecture decision

### Considered options

#### Single package with internal modules

One TypeScript package contains the CLI, contracts, reducers, validators, channel policies, plugin assets, fixtures, and tests.

Advantages:

- Smallest useful release.
- One installation and version.
- Straightforward fixture replay.
- Strong internal boundaries without workspace overhead.

#### Workspace monorepo

Contracts, CLI, router, adapters, and host plugins are separate packages.

Advantages:

- Strong publish-time isolation.

Disadvantages:

- Premature release, dependency, and build complexity.
- More version coordination before there is a second independent consumer package.

#### Skill-first repository

Markdown playbooks and shell scripts exchange loosely structured JSON.

Advantages:

- Fastest prototype.

Disadvantages:

- Weak schema evolution, validation, replay, and downstream compatibility.

### Decision

Use one tool-agnostic TypeScript package with clear internal modules and first-class Codex and Claude plugin packaging.

Proposed structure:

```text
src/
  cli/
    plan/
    record-observation/
    validate/
  contracts/
    observation/
    receipt/
    errors/
    versions/
  modules/
    hashtag/
    search-term/
  channels/
    router/
    policies/
  state/
    project-store/
plugin/
  shared-playbooks/
  codex/
  claude/
  channels/
    facebook/
    instagram/
    linkedin/
    x/
    tiktok/
    youtube/
    pinterest/
schemas/
  v1/
fixtures/
tests/
  contract/
  fixture-replay/
  browser-acceptance/
docs/
```

These are internal boundaries, not separately published packages.

## Component responsibilities

### Codex and Claude plugins

The host plugins:

- Recognize natural-language research intent.
- Support direct invocation.
- Normalize creative inputs into a brief.
- Collect initial confirmation.
- Implement guided and automatic orchestration.
- Control the available browser.
- Follow channel playbooks.
- Pause for authentication or UI recovery.
- Make contextual candidate selections.
- Record observations through the CLI.
- Present results after each channel.

Codex and Claude are equal v1 targets. Shared playbooks are canonical; host-specific wrappers adapt installation, invocation, and browser-tool syntax without duplicating research policy.

### CLI core

The CLI is non-interactive and browser-agnostic. It owns:

- Plan validation and creation.
- Durable project-local state.
- Idempotent observation recording.
- Contract-version enforcement.
- Module-specific completeness validation.
- Receipt reduction.
- Stable stdout JSON envelopes.
- Stable exit meanings.

The CLI does not interpret creative assets, operate a browser, or choose recommendations.

### Channel router

The router selects a playbook using `(channel, requested modules)`. It contains no browser navigation, candidate selection, ranking, or publishing logic.

### Channel playbooks

There is one playbook per channel. Each contains module-specific procedures for:

- Supported modules.
- Authentication and public-access policy.
- Native search entry points.
- Semantic UI checkpoints.
- Autocomplete capture.
- Bounded result inspection.
- Candidate normalization.
- Default recommendation ranges.
- Refinement and zero handling.
- Authentication and challenge recovery.
- UI-change diagnostics.
- CLI observation templates.

### Module packages

Each module owns:

- Planning rules.
- Observation payload schemas.
- Reducer.
- Completeness validator.
- Receipt result schema.
- Candidate normalization.
- Channel support matrix.

The generic observation and receipt envelopes contain no hashtag- or search-term-specific fields.

### Optional adapters

Future provider APIs may emit observations through the same generic contract with `source.kind: "provider_api"`. Under v1 policy, API observations may enrich a receipt but cannot replace required channel-native browser evidence.

## CLI protocol

The public executable is `social-metadata`.

### `plan`

Create a new run:

```sh
social-metadata plan --json @request.json
```

Resume and retrieve the next required action for an existing run:

```sh
social-metadata plan --run <run-id>
```

The initial request contains:

- Normalized creative brief.
- Safe input references.
- Ordered channels.
- Locale, region, and timezone.
- Orchestration mode.
- Enabled modules.
- Default evidence tier.
- A required user-confirmed `browserSelection` of `chrome` or `in_app`.
- Per-channel overrides.
- Exact approved prefixes for the next guided step, when applicable.
- Plan-defined interaction bounds.

The plan is immutable except through versioned, append-only plan amendments. Automatic query derivation, user edits, browser-selection changes, and the single refinement round are recorded as amendments so the exact history remains auditable. A browser change is accepted before the active channel records native evidence, or after a pure interruption; it is rejected mid-channel after native evidence exists.

### `record-observation`

```sh
social-metadata record-observation \
  --run <run-id> \
  --json @observation.json
```

Observations are append-only. Re-recording an identical `observationId` is a successful no-op. Reusing an ID with different content is a contract error.

### `validate`

```sh
social-metadata validate --run <run-id>
```

`validate` reduces current state into the latest channel receipt or returns a machine-readable incomplete, interrupted, or failed result.

### Output envelope

Every invocation writes exactly one versioned JSON object to stdout:

```json
{
  "contractVersion": "1.0",
  "command": "validate",
  "ok": true,
  "runId": "run_...",
  "data": {},
  "warnings": [],
  "errors": []
}
```

Human diagnostics and debug logs go to stderr. The CLI never emits prompts.

### Exit meanings

| Exit | Meaning |
|---:|---|
| `0` | Complete, justified zero, or intentionally not applicable |
| `2` | Invalid command or JSON contract |
| `3` | Incomplete evidence or unfinished run |
| `4` | Resumable authentication or challenge interruption |
| `5` | Unresolved platform UI change |
| `6` | Locale or environment mismatch |

Nonzero exits still emit the JSON output envelope.

## Project-local state

The default store is:

```text
.social-metadata/
  runs/<run-id>/
    plan.json
    plan-amendments.jsonl
    observations.jsonl
    status.json
    receipts/
    diagnostics/
```

The caller may override the root path. On first use in a Git repository, the CLI adds `.social-metadata/` to the local repository exclude file at `.git/info/exclude`; it does not modify the tracked project `.gitignore`.

State is private working data. Runs are resumable across processes, Codex or Claude conversations, and authentication pauses. Completed channel steps are not repeated on resume unless the user explicitly requests a refresh.

Fresh research is the default for a new run. Matching prior receipts may be referenced for comparison but are never silently substituted for live evidence.

## Observation contract

The shared envelope is module-neutral:

```json
{
  "contractVersion": "1.0",
  "observationId": "obs_...",
  "runId": "run_...",
  "channelRunId": "channel_...",
  "capturedAt": "2026-07-27T14:30:00-07:00",
  "source": {
    "kind": "browser_ui",
    "channel": "instagram",
    "browser": "chrome",
    "accessMode": "authenticated",
    "uiLocale": "en-US",
    "region": "US",
    "timezone": "America/Phoenix",
    "personalizedSession": true,
    "surface": "autocomplete"
  },
  "module": {
    "name": "search-term",
    "schemaVersion": "1.0"
  },
  "kind": "suggestion_set",
  "query": {
    "topic": "remote work",
    "intent": "tips for small software teams",
    "typedText": "remote work"
  },
  "payload": {}
}
```

`payload` is selected by the module and observation kind.

### Observation kinds

- `session_state`: browser, authentication, locale, and surface readiness.
- `suggestion_set`: exact typed prefix, visible suggestions, display positions, and stopping reason.
- `result_sample`: exact candidate query, bounded inspected results, relevance assessments, optional visible engagement, and stopping reason.
- `recommendation_decision`: selected or rejected candidate, host rationale, and evidence references.
- `interruption`: authentication, challenge, locale mismatch, or UI-change state.
- `diagnostic`: expected checkpoint, observed landmarks, browser details, and optional screenshot reference.

### Suggestion evidence

A suggestion item stores:

- Exact displayed value.
- Display position.
- Optional channel-native type label.
- Optional visible auxiliary text.

Display position is observational only. The schema description, validator warnings, plugin presentation, and documentation state that it is not performance proof.

### Result-sample evidence

For every intended recommendation in `results_sample`, the host inspects up to three visible, distinct results. The observation stores:

- Result position within the inspected surface.
- Minimal visible excerpt or descriptive summary.
- Relevance classification: `relevant`, `mixed`, or `irrelevant`.
- Short relevance rationale.
- Opportunistic visible engagement fields with original labels and values.
- Whether the native surface was exhausted before three results.

A recommendation is sample-supported when:

- Three results are available and at least two are classified `relevant`; or
- Exactly two results are available, the native surface is explicitly exhausted, and both are classified `relevant`.

One visible result is insufficient to recommend a candidate under `results_sample`. An explicit native no-results state can support rejection or a zero outcome.

## Module contracts

### `search-term`

The module stores:

- Exact suggested phrase.
- Exact typed prefix.
- Channel-native auxiliary labels.
- Selection or rejection rationale.
- Suggestion evidence references.
- Result evidence references when required.
- Cross-channel or creative-brief seed provenance.

Recommendations preserve the exact native phrase. The host may normalize whitespace for comparison, but the receipt retains the displayed form.

### `hashtag`

The module stores:

- Exact displayed hashtag.
- Channel-specific canonical comparison form.
- Selection or rejection rationale.
- Suggestion evidence references.
- Result evidence references when required.
- Search-term or cross-channel seed provenance.

The receipt preserves original casing and presentation. Canonicalization is for deduplication only.

### Default recommendation ranges

Defaults are deliberately conservative and configurable per run:

| Channel | Search terms | Hashtags |
|---|---:|---:|
| Facebook | 3–5 | 1–3 |
| Instagram | 3–5 | 3–5 |
| LinkedIn | 3–5 | 1–3 |
| X | 3–5 | 1–2 |
| TikTok | 3–5 | 3–5 |
| YouTube | 3–5 | 1–3 |
| Pinterest | 3–5 | Not applicable |

The host may return fewer recommendations, including zero, when evidence does not support the target range.

## Planning and interaction bounds

Every module plan records exact limits. V1 defaults are:

- At most three initial prefixes per module and channel.
- At most ten visible suggestions per prefix.
- One refinement round.
- At most two revised prefixes in the refinement round.
- No more recommendations than the channel-specific upper bound.
- At most three inspected results per intended recommendation.
- No infinite scrolling or pagination beyond the explicit result bound.
- A 24-hour evidence freshness window at validation time.

Plans may lower these bounds. Increasing them requires explicit user configuration in guided mode or an explicit caller setting in automatic mode.

## Candidate decisions

Codex or Claude makes contextual selections. The CLI only validates provenance and completeness.

Every researched recommendation must:

- Match an exact captured native suggestion.
- Reference its suggestion evidence.
- Include a contextual rationale tied to the creative brief.
- Reference a qualifying result sample when `results_sample` is selected.

Every candidate the host meaningfully considers receives a `selected` or `rejected` decision. Raw suggestions that the host does not shortlist remain available in evidence without a fabricated decision.

Rejected candidates use reason codes such as:

- `not_relevant_to_brief`
- `too_broad`
- `too_narrow`
- `ambiguous_intent`
- `insufficient_result_relevance`
- `duplicate_candidate`
- `outside_recommendation_range`

Model-inferred candidates absent from native evidence may appear only under `modelSuggestions`. They cannot enter `researchedRecommendations`.

## Receipt model

A channel receipt contains:

- Receipt and contract versions.
- Run and channel-run IDs.
- Plan digest and amendment references.
- Channel and enabled modules.
- Created, captured, and validated timestamps.
- Requested and observed locale, region, and timezone.
- Browser, access mode, and personalized-session flag.
- Evidence tier.
- Module outcomes.
- Researched recommendations.
- Rejected shortlist candidates.
- Raw observation references.
- Warnings and failures.
- Optional diagnostic attachment references.

Module outcomes are:

- `recommended`
- `zero`
- `not_applicable`
- `interrupted`
- `failed`

`autocomplete_only` and `results_sample` are both successful and consumable. Downstream callers decide which tier is sufficient.

A complete `zero` outcome requires:

- All current planned prefixes attempted.
- The single refinement round attempted or explicitly unnecessary because the native surface returned a definitive empty state.
- Plausible shortlisted candidates rejected with reason codes.
- Native evidence references.
- A zero reason such as `no_native_candidates`, `candidates_not_relevant`, or `insufficient_result_relevance`.

## Browser policy

| Channel | Default access | Public-browser completion |
|---|---|---|
| Facebook | Authenticated Chrome | Not sufficient for normal completion |
| Instagram | Authenticated Chrome | Not sufficient for normal completion |
| LinkedIn | Authenticated Chrome | Not sufficient for normal completion |
| X | Authenticated Chrome | Not sufficient for normal completion |
| TikTok | Authenticated Chrome preferred | Allowed when native search remains available |
| YouTube | Authenticated Chrome preferred | Allowed |
| Pinterest | Authenticated Chrome preferred | Allowed for `search-term` |

Chrome is used whenever research depends on the user's authenticated session. The Codex in-app browser is preferred for permitted public surfaces. Claude follows the same access policy through its available browser-control integration.

Browser selection is a must-do first step. The CLI rejects plans without a
user-confirmed choice, unsupported channel/browser combinations, and browser UI
observations that do not match the effective selection. Every next action
repeats the effective choice so a resumed host can reconnect to the intended
surface. Only the logical surface name is stored; browser handles, profiles,
accounts, cookies, and storage state are not persisted.

All browser surfaces are host-managed and user-visible. Standalone Playwright launches, profile-less Chromium, downloaded test browsers, and persisted automation profiles are unsupported. The browser-control implementation may automate the approved host-managed surface, but it may not substitute another browser or profile.

Every receipt records whether evidence came from an authenticated, public, or personalized session. Public and authenticated observations are not silently combined within one module result.

## Channel playbook sequence

For each channel:

1. Navigate directly to native search.
2. Verify channel, locale, access state, and semantic search landmarks.
3. Record `session_state`.
4. Execute approved or automatic search-term prefixes.
5. Capture visible search-term suggestions.
6. Select and reject search-term candidates.
7. Derive hashtag seeds from supported terms and the creative brief.
8. Execute approved or automatic hashtag prefixes when supported.
9. Capture visible hashtag suggestions.
10. Perform the configured result sample for every intended recommendation.
11. Record recommendation decisions.
12. Validate and return the channel receipt.

The playbook never enters a composer and never falls back to scraping.

## Interruptions and diagnostics

### Authentication or challenge

When the expected search surface requires authentication or presents a user-resolvable challenge:

1. Record an `interruption`.
2. Preserve the current channel step.
3. Capture a diagnostic screenshot.
4. Ask the user to sign in or resolve the challenge manually.
5. Wait for the user to confirm that the same browser session is ready.
6. Re-verify the semantic search checkpoint.
7. Resume the same run.

The plugin does not ask the user to provide a password, one-time code, cookie, token, or browser storage export. It does not type credentials or persist the authenticated browser profile.

### UI change

When expected semantic landmarks are absent:

1. Record the expected checkpoint.
2. Record the current origin, browser details, locale, visible landmark summary, and last successful step.
3. Capture a diagnostic screenshot.
4. Allow one user-assisted attempt to identify the replacement search surface.
5. Resume if the checkpoint can be re-established.
6. Otherwise finalize the channel with `failed` and reason `ui_changed`.

UI uncertainty never becomes an empty suggestion set or zero outcome.

Screenshots are otherwise opt-in. Receipts reference local attachment paths and checksums; they do not embed screenshots.

## Privacy and safety

- Project-local state is private and Git-ignored through `.git/info/exclude`.
- Source assets are referenced, not copied.
- Receipts minimize visible result text to what is needed for relevance.
- Credentials, cookies, tokens, account IDs, and raw browser state are prohibited.
- No raw HTML or full-page DOM dumps are stored.
- Screenshots are captured only for interruptions by default.
- The user resolves authentication and challenges manually.
- No hidden or private platform endpoints are used.
- The system never publishes or modifies channel content.

## Verification strategy

### Contract tests

- Validate every plan, amendment, observation, receipt, and error schema.
- Prove one stable stdout envelope per command.
- Prove stable exit meanings.
- Prove strict hashtag and search-term payload separation.
- Prove deterministic reduction from fixtures.
- Prove backward compatibility for every published contract version.

### State tests

- Create and resume project-local runs.
- Add the state directory to `.git/info/exclude`.
- Replay identical observation IDs as no-ops.
- Reject conflicting duplicate IDs.
- Preserve plan amendment order.
- Skip completed channel steps on resume.
- Refresh only when explicitly requested.

### Fixture replay

Fixtures cover every channel and:

- Successful autocomplete-only recommendations.
- Successful result-sampled recommendations.
- Visible engagement present and absent.
- Contextually rejected exact candidates.
- Guided and automatic orchestration.
- User-edited prefixes.
- One successful refinement round.
- Complete zero outcome.
- Pinterest hashtag not applicable.
- Authentication pause and resume.
- UI-change pause, assisted resume, and final failure.
- Locale mismatch.
- Stale evidence.
- Cross-channel seed lineage.
- Unsupported model suggestions excluded from researched recommendations.

The same shared fixtures produce equivalent receipts through Codex and Claude wrappers.

### Selector-change diagnostics

Diagnostic fixtures represent:

- Search input missing or renamed.
- Suggestion panel absent.
- Search filters moved.
- Login or consent wall.
- Challenge or CAPTCHA.
- Native empty state.
- Failed loading that must not be interpreted as empty.

Playbooks identify semantic checkpoints rather than depending solely on brittle CSS selectors.

### Live browser acceptance

Each channel playbook must demonstrate:

- Correct native search surface reached.
- Exact planned prefix visibly entered.
- Suggestions captured before search submission.
- Search-term-to-hashtag provenance recorded.
- Result inspection kept within plan bounds.
- Every result-sampled recommendation inspected.
- No composer or publishing UI entered.
- Authentication interruption resumed.
- Missing landmarks produced useful diagnostics.
- Final recommendations referenced exact native evidence.

Authenticated acceptance runs locally in a user-controlled Chrome session. Credentials and browser state never enter CI. Permitted public surfaces are additionally accepted through the Codex in-app browser.

### Installation and integration acceptance

- Install the Codex plugin into a clean test project.
- Install the Claude plugin into a clean test project.
- Run equivalent fixture workflows through both.
- Invoke all three CLI commands from a small subprocess consumer.
- Parse stdout without reading human prose.
- Verify no Buffer, GrowthOps, Lineage, provider credential, or paid API dependency.

## Independent dogfooding

The repository supports dogfooding without another codebase:

- Use `.social-metadata/` for private local runs.
- Run a real channel workflow through Codex and Claude.
- Convert deliberately sanitized observations into committed fixtures.
- Replay fixtures without browser access.
- Run public-surface acceptance without social credentials where channel policy permits.
- Run authenticated acceptance only with a user-controlled local session.

Lineage or another repository integrates later by invoking the same CLI commands as subprocesses and consuming versioned JSON. No Lineage-specific code belongs in this repository.

## Future extensions

Future modules may include sounds, mentions, accounts, locations, captions, titles, or descriptions. Each must add a separate module package, payload schemas, reducer, validator, support matrix, and receipt result.

They must not add fields to the v1 hashtag or search-term schemas.

Provider APIs may later enrich browser observations behind the same contract. A future policy version may define when an API can satisfy evidence requirements, but v1 always requires current native browser evidence for researched recommendations.

## Release acceptance

Version one is ready for implementation completion only when:

1. `plan`, `record-observation`, and `validate` satisfy their versioned JSON contracts.
2. Codex and Claude packages drive the same shared workflow.
3. Both modules work on their supported channel matrix.
4. Pinterest returns a successful search-term result and explicit hashtag `not_applicable`.
5. Both evidence tiers are successful and consumable.
6. Guided and automatic runs are resumable.
7. Authentication and UI changes pause visibly and recover as designed.
8. Justified zero outcomes cannot mask access or UI failures.
9. Every researched recommendation references exact native evidence.
10. Fixture replay covers all channels and critical outcomes.
11. Live browser acceptance passes for every channel playbook.
12. A standalone subprocess consumer can use the CLI without another repository or service.

## Resolved design decisions

- The CLI is tool-agnostic, non-interactive, and JSON-first.
- Codex and Claude are equal v1 plugin targets.
- Hosts control browsers; the CLI does not.
- Both `search-term` and `hashtag` run by default.
- Pinterest supports only `search-term`.
- `autocomplete_only` is the default and is a successful result.
- `results_sample` inspects every intended recommendation.
- Visible engagement is opportunistic and descriptive.
- Guided mode is the default; automatic mode is user-selectable on every run.
- Guided search terms run before a second approved hashtag plan.
- Automatic mode requires only initial confirmation unless interrupted.
- One bounded refinement round precedes a zero outcome.
- Results are presented after every channel.
- Codex or Claude selects recommendations; the CLI validates provenance.
- Exact native evidence is required for researched recommendations.
- Model suggestions are kept separate.
- Earlier-channel findings may seed later channels but do not transfer evidence.
- Locale and market are inferred, proposed, and confirmed once.
- State is private, project-local, Git-ignored, fresh by default, and resumable.
- Structured evidence is default; screenshots are automatic only for interruptions.
- The plugin returns research by default and does not modify creative work.
