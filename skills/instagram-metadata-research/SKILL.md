---
name: instagram-metadata-research
description: Research Instagram hashtag and search-term suggestions with current authenticated native evidence.
---

# Instagram metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `instagram` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Require `targetMatched=true`. Only `instagram_search` with expected and observed `instagram_native_search_entry` may proceed. `instagram_authenticated_shell` with `instagram_authenticated_navigation`, or `instagram_target_unavailable` with `target_unavailable`, is `ui_change`.
- If authenticated navigation exposes an evidenced native Search navigation control, the shared contract permits exactly one in-origin activation and one repeat of the same bounded structural projection. Never guess a URL or selector.
- Require native result landmarks only after a query interaction begins.
- Search terms use ordinary phrases; hashtags use `#` plus an unspaced phrase.
- Preserve personalization and restricted-hashtag states. Reject restricted tags with the visible native reason.
- Never treat a login screen, missing dropdown, or restricted tag as native empty.
- For result samples record caption summary, account, content type, relative time, and visibly labelled engagement.
- Recommend 3–5 search terms or 3–5 hashtags when evidence supports them.
