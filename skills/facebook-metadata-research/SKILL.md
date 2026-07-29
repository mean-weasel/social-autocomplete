---
name: facebook-metadata-research
description: Research Facebook hashtag and search-term suggestions with current authenticated native evidence.
---

# Facebook metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `facebook` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Require `targetMatched=true`. Only `facebook_search` with expected and observed `facebook_native_search_entry` may proceed. `facebook_authenticated_shell` with `facebook_authenticated_navigation`, or `facebook_target_unavailable` with `target_unavailable`, is `ui_change`.
- If authenticated navigation exposes an evidenced native Search navigation control, the shared contract permits exactly one in-origin activation and one repeat of the same bounded structural projection. Never guess a URL or selector.
- Require permission-scoped result landmarks only after a query interaction begins.
- Search terms use ordinary phrase prefixes and accept only native phrase completions.
- Hashtags use `#` plus an unspaced phrase and accept only exact native hashtag suggestions.
- Authenticated autocomplete remains an acceptance gap: expose `authentication_required` or `ui_change` rather than guessing or treating missing UI as native empty.
- For result samples record a short post excerpt, author/Page, relative time, and only visibly labelled engagement.
- Recommend 3–5 search terms or 1–3 hashtags when evidence supports them.
