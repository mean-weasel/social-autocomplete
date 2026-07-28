---
name: linkedin-metadata-research
description: Research LinkedIn search terms and bounded hashtag evidence in an authenticated native search session.
---

# LinkedIn metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `linkedin` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Verify LinkedIn navigation and authenticated state, then require a semantic native search-entry control and results/category landmarks. Authenticated Feed and primary navigation without search entry is `ui_change`, never authentication failure or native empty.
- Record only the enumerated route class and sanitized landmark labels: `linkedin_search` with `linkedin_native_search_entry` may proceed; `linkedin_authenticated_feed` with `linkedin_authenticated_feed_navigation` must stop as `ui_change`. Do not guess a fallback control.
- Search terms use a keyword phrase or natural-language query. Preserve entity labels and reject companies, products, and people as phrase completions.
- Hashtags use `#` plus an unspaced phrase, but LinkedIn currently documents that suggested searches do not suggest hashtags. Make the initial and one refinement attempt, then return justified zero unless an exact native hashtag suggestion appears.
- For result samples record excerpt, author/organization, relative time, and visibly labelled reactions/comments/reposts.
- Recommend 3–5 search terms or 1–3 hashtags only when supported.
