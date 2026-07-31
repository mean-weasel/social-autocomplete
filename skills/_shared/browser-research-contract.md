# Browser research contract

Use this contract with the channel-specific instructions in the calling skill.

1. Before any research, ask the user to choose and confirm `chrome` or `in_app`.
2. For every new run, explicitly ask **which supported channels to research and in what order**. Record the confirmed ordered list in `channels`. Never inherit a prior run's channels. When explicitly resuming the same `runId`, reuse its recorded list without asking again.
3. Infer the topic, modules (`hashtag` and `search-term` by default), locale, evidence tier (`autocomplete_only` by default), and orchestration mode. Ask the user to confirm the remaining inferred values, the chosen channels, and browser compatibility. Offer `guided` and `automatic` every run.
4. Create the run with `social-metadata plan`, including the confirmed `browserSelection` and ordered `channels`. In automatic mode the agent chooses prefixes and candidates; in guided mode it asks before those choices. The CLI does not drive the browser or choose recommendations.
5. Pause before each channel. Read the effective `nextAction.browserSelection`
   and establish that exact host browser binding in the current task turn
   before marking the channel action started. This pre-acknowledgement check is
   an availability probe only, not a retained runtime object or authority for
   later target creation. Never assume a browser runtime object survives a
   Codex turn, task, process, or manager acknowledgement boundary. Use the user's
   existing, visible Chrome profile for authenticated work. Use the Codex
   host-managed in-app Browser only for a public surface allowed by that
   channel's playbook. Never launch or fall back to standalone, temporary, or
   profile-less Playwright/Chromium. If the selected browser is incompatible,
   unavailable, or disconnected, record `browser_binding_unavailable` while
   the action remains unstarted; do not choose another browser unless the user
   confirms it and the CLI records an amendment.
6. Only after the canonical browser-action start is persisted, the manager
   returns the exact acknowledgement, and the worker exact-compares its copied
   manager-supplied lease hash, resolve the exact selected host browser binding
   again in that same post-acknowledgement worker continuation. With no
   commentary, protocol event, manager/worker message, or other intermediate
   worker output after that resolution, immediately call `tabs.new` on that
   binding to create one new agent tab, then perform that tab's one bounded
   lifecycle through mandatory release. Navigate the new tab only to the channel
   playbook's typed official root. This is the task-scoped plugin-owned target lease. A
   post-acknowledgement binding-resolution or `tabs.new` failure is a
   non-replayable `started` action and stops as `ambiguous_browser_action`; do
   not retry, request another acknowledgement, or return to the earlier
   availability probe. Never list, enumerate, claim, inspect, match, or reuse
   user tabs. Keep the raw binding, tab object, or identifier only in the host
   browser runtime. Derive the durable lease identity from the run, current
   task, channel, selected browser, and acknowledged action descriptor; emit
   only its deterministic SHA-256 hash and lifecycle enums.
7. Verify channel identity, access, locale, and semantic search landmarks in that exact plugin-created target using the [sanitized authentication preflight](../../docs/browser-acceptance/README.md#sanitized-authentication-preflight). Return only structural booleans, sanitized lifecycle/status values, the lease hash, and the enumerated route, expected landmark, and observed landmark. Never return a complete open-tab list or any target collection. Never return or retain a full authenticated DOM snapshot, raw HTML, `body` text, feed content, tab titles or URLs, raw target identifiers, or account identifiers. For the native search projection, use only the calling playbook's closed channel-specific exact accessible-name allowlist: `searchbox`, `combobox`, or `textbox` for entry names, then `link` or `button` for optional in-origin navigation names. Query every role/name pair directly and separately with exact string matching; never use a regex or fuzzy match. Count visible allowed matches across the finite projection and require exactly one visible allowed entry match or exactly one visible allowed navigation-control match; zero, multiple, or conflicting matches fail closed. Never enumerate or slice `querySelectorAll`, generic input/control collections, or page text to discover a candidate. If sign-in is required, record the explicit `authentication_handoff` lifecycle, preserve the live target handle in the same task, ask the user to sign in manually in that target, and resume only after confirmation. Never ask for, type, read, or store credentials, one-time codes, cookies, tokens, or browser storage state. If the task or process ends during that explicit handoff, discard the stale handle and create a new agent tab from the same typed official root in the recovery task; never rediscover the old tab. Every other started-but-incomplete browser action remains ambiguous and fails closed without replay. When the dedicated target is authenticated but the native search entry is absent, one bounded recovery is allowed only if the same structural projection evidences exactly one in-origin native Search navigation control. Activate that evidenced control once and repeat the exact same finite projection once. Never guess a URL or selector, inspect page text, broaden reads, or make a second recovery attempt. If the expected landmark is still absent or an interaction fails, record `ui_change` with the enumerated route and expected/observed landmarks. `targetMatched=true` must use the channel's authenticated-shell/feed observed landmark; only `targetMatched=false` may use `target_unavailable`. Never reinterpret failure as an empty result.
8. Enter each planned prefix exactly. Capture up to ten visible native suggestions, preserving displayed order, type, and auxiliary text. Order is evidence of what appeared, not proof of popularity or performance.
9. Record selected and rejected candidates with contextual rationales and evidence references. Do not use accounts, typed entities, navigation actions, or refinement chips unless the channel/module playbook accepts that candidate kind.
10. For `results_sample`, search every intended recommendation and inspect up to three distinct, relevant, non-sponsored results. Record visible content/relevance and labelled engagement descriptively; do not claim causal performance.
11. If no candidate qualifies, perform at most one bounded refinement round. Zero requires explicit current native empty/no-candidate evidence and a justification.
12. Release/finalize the plugin-created target before completing the browser action and recording a normal channel result. The explicit same-task manual-authentication handoff is the sole unreleased exception.
13. Record observations with `social-metadata record-observation`, then run `social-metadata validate`. Return that channel's result to the user before advancing. A recommendation is consumable only when validation succeeds.

Never publish, enter a composer, scrape/crawl, enumerate user tabs or hidden DOM, claim an existing tab, call private endpoints, launch standalone Chromium, persist a browser profile or raw target handle, bypass authentication/challenges, or use unbounded scrolling. Never repeat a preflight with a broader tab or DOM read after a failed structural check. Provider APIs are optional enrichment and never substitute for channel-native evidence.
