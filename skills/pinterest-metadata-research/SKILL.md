---
name: pinterest-metadata-research
description: Research Pinterest search-term suggestions and return explicit not-applicable for hashtags.
---

# Pinterest metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `pinterest` playbook selected by the router.

- Prefer signed-in Chrome. Codex may use the in-app browser for public search-term completion.
- For `hashtag`, return `not_applicable` immediately without opening a browser.
- For `search-term`, use ordinary topic phrases and verify Pinterest identity, a semantic Search control, Pins, and result/refinement landmarks. Personal/public routes may proceed when Search is present.
- Record only the enumerated route class and sanitized landmark labels. `pinterest_public_search` or `pinterest_personal_search` with `pinterest_search_control` may proceed. `pinterest_business_hub` or `pinterest_root_after_search_redirect` without Search is `ui_change`, never challenge or native empty; do not guess a recovery control.
- Native autocomplete is official but the current public desktop dropdown is an acceptance gap. Keep refinement chips as auxiliary evidence; do not substitute them for autocomplete suggestions.
- For result samples record Pin/product title, accessible label, result type, and visible price.
- Recommend 3–5 search terms when evidence supports them.
