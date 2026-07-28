---
name: facebook-metadata-research
description: Research Facebook hashtag and search-term suggestions with current authenticated native evidence.
---

# Facebook metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `facebook` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Verify Facebook identity, authenticated state, native search, and permission-scoped result landmarks.
- Search terms use ordinary phrase prefixes and accept only native phrase completions.
- Hashtags use `#` plus an unspaced phrase and accept only exact native hashtag suggestions.
- Authenticated autocomplete remains an acceptance gap: expose `authentication_required` or `ui_change` rather than guessing.
- For result samples record a short post excerpt, author/Page, relative time, and only visibly labelled engagement.
- Recommend 3–5 search terms or 1–3 hashtags when evidence supports them.
