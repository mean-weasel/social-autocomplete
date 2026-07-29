# Browser research contract

Use this contract with the channel-specific instructions in the calling skill.

1. Before any research, ask the user to choose and confirm `chrome` or `in_app`.
2. For every new run, explicitly ask **which supported channels to research and in what order**. Record the confirmed ordered list in `channels`. Never inherit a prior run's channels. When explicitly resuming the same `runId`, reuse its recorded list without asking again.
3. Infer the topic, modules (`hashtag` and `search-term` by default), locale, evidence tier (`autocomplete_only` by default), and orchestration mode. Ask the user to confirm the remaining inferred values, the chosen channels, and browser compatibility. Offer `guided` and `automatic` every run.
4. Create the run with `social-metadata plan`, including the confirmed `browserSelection` and ordered `channels`. In automatic mode the agent chooses prefixes and candidates; in guided mode it asks before those choices. The CLI does not drive the browser or choose recommendations.
5. Pause before each channel. Read the effective `nextAction.browserSelection`
   and establish that exact host browser binding in the current task turn
   before marking the channel action started. Never assume a browser runtime
   object survives a Codex turn, task, or process boundary. Use the user's
   existing, visible Chrome profile for authenticated work. Use the Codex
   host-managed in-app Browser only for a public surface allowed by that
   channel's playbook. Never launch or fall back to standalone, temporary, or
   profile-less Playwright/Chromium. If the selected browser is incompatible,
   unavailable, or disconnected, record `browser_binding_unavailable` while
   the action remains unstarted; do not choose another browser unless the user
   confirms it and the CLI records an amendment.
6. Verify channel identity, access, locale, and semantic search landmarks using the [sanitized authentication preflight](../../docs/browser-acceptance/README.md#sanitized-authentication-preflight). Filter to the expected channel target inside one browser-control operation and discard non-matches before returning. Never return a complete open-tab list or unfiltered target collection. Return only structural booleans, a sanitized status, and the enumerated route, expected landmark, and observed landmark. Never return or retain a full authenticated DOM snapshot, raw HTML, `body` text, feed content, tab titles or URLs, or account identifiers. If sign-in is required, record `authentication_required`, preserve the current step, ask the user to sign in manually in that same browser session, and resume the same run only after the user confirms readiness. Never ask for, type, read, or store credentials, one-time codes, cookies, tokens, or browser storage state. When the target is matched and authenticated but the native search entry is absent, one bounded recovery is allowed only if the same structural projection evidences an in-origin native Search navigation control. Activate that evidenced control once and repeat the exact same bounded projection. Never guess a URL or selector, inspect page text, broaden target reads, or make a second recovery attempt. If the expected landmark is still absent or an interaction fails, record `ui_change` with the enumerated route and expected/observed landmarks. Never reinterpret failure as an empty result.
7. Enter each planned prefix exactly. Capture up to ten visible native suggestions, preserving displayed order, type, and auxiliary text. Order is evidence of what appeared, not proof of popularity or performance.
8. Record selected and rejected candidates with contextual rationales and evidence references. Do not use accounts, typed entities, navigation actions, or refinement chips unless the channel/module playbook accepts that candidate kind.
9. For `results_sample`, search every intended recommendation and inspect up to three distinct, relevant, non-sponsored results. Record visible content/relevance and labelled engagement descriptively; do not claim causal performance.
10. If no candidate qualifies, perform at most one bounded refinement round. Zero requires explicit current native empty/no-candidate evidence and a justification.
11. Record observations with `social-metadata record-observation`, then run `social-metadata validate`. Return that channel's result to the user before advancing. A recommendation is consumable only when validation succeeds.

Never publish, enter a composer, scrape/crawl, enumerate hidden DOM, call private endpoints, launch standalone Chromium, persist a browser profile, bypass authentication/challenges, or use unbounded scrolling. Never repeat a preflight with a broader tab or DOM read after a failed structural check. Provider APIs are optional enrichment and never substitute for channel-native evidence.
