---
name: x-metadata-research
description: Research X search terms and hashtags with current authenticated native search evidence.
---

# X metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `x` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Verify X navigation, authenticated state, Search query combobox, and search-timeline landmarks.
- Search terms use ordinary phrases; hashtags use `#` plus an unspaced keyword.
- The exact “Search for …” row is a navigation action, not a recommendation. Accounts are also excluded.
- If bounded attempts show only the search action/accounts, record a justified zero instead of inventing a completion.
- For result samples record post excerpt, account/time, and only visibly labelled replies, reposts, likes, bookmarks, or views.
- Recommend 3–5 search terms, 1–2 hashtags.
