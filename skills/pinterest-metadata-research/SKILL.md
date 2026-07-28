---
name: pinterest-metadata-research
description: Research Pinterest search-term suggestions and return explicit not-applicable for hashtags.
---

# Pinterest metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `pinterest` playbook selected by the router.

- Prefer signed-in Chrome. Codex may use the in-app browser for public search-term completion.
- For `hashtag`, return `not_applicable` immediately without opening a browser.
- For `search-term`, use ordinary topic phrases and verify Pinterest identity, Search combobox, Pins, and result/refinement landmarks.
- Native autocomplete is official but the current public desktop dropdown is an acceptance gap. Keep refinement chips as auxiliary evidence; do not substitute them for autocomplete suggestions.
- For result samples record Pin/product title, accessible label, result type, and visible price.
- Recommend 3–5 search terms when evidence supports them.
