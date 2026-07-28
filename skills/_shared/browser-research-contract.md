# Browser research contract

Use this contract with the channel-specific instructions in the calling skill.

1. Before any research, infer the topic, channels, modules (`hashtag` and `search-term` by default), locale, evidence tier (`autocomplete_only` by default), and orchestration mode. Ask the user to confirm inferred values. Offer `guided` and `automatic` every run.
2. Create the run with `social-metadata plan`. In automatic mode the agent chooses prefixes and candidates; in guided mode it asks before those choices. The CLI does not drive the browser or choose recommendations.
3. Pause before each channel. Use Chrome for authenticated work. Use the Codex in-app browser only for a public surface allowed by that channel's playbook.
4. Verify channel identity, access, locale, and semantic search landmarks. If sign-in is required, record the interruption, ask the user to sign in, and resume the same run. If an expected landmark or interaction fails, record `ui_change` with the expected and observed landmarks. Never reinterpret failure as an empty result.
5. Enter each planned prefix exactly. Capture up to ten visible native suggestions, preserving displayed order, type, and auxiliary text. Order is evidence of what appeared, not proof of popularity or performance.
6. Record selected and rejected candidates with contextual rationales and evidence references. Do not use accounts, typed entities, navigation actions, or refinement chips unless the channel/module playbook accepts that candidate kind.
7. For `results_sample`, search every intended recommendation and inspect up to three distinct, relevant, non-sponsored results. Record visible content/relevance and labelled engagement descriptively; do not claim causal performance.
8. If no candidate qualifies, perform at most one bounded refinement round. Zero requires explicit current native empty/no-candidate evidence and a justification.
9. Record observations with `social-metadata record-observation`, then run `social-metadata validate`. Return that channel's result to the user before advancing. A recommendation is consumable only when validation succeeds.

Never publish, enter a composer, scrape/crawl, enumerate hidden DOM, call private endpoints, bypass authentication/challenges, or use unbounded scrolling. Provider APIs are optional enrichment and never substitute for channel-native evidence.
