---
name: linkedin-metadata-research
description: Research LinkedIn search terms and bounded hashtag evidence in an authenticated native search session.
---

# LinkedIn metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `linkedin` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Create a new plugin-owned agent tab at the typed official root `https://www.linkedin.com/`; never search for or reuse an existing LinkedIn tab.
- Require `targetMatched=true`, then require a semantic native search-entry control. Only `linkedin_search` with expected and observed `linkedin_native_search_entry` may proceed. `linkedin_authenticated_feed` with `linkedin_authenticated_feed_navigation`, or `linkedin_target_unavailable` with `target_unavailable`, is `ui_change`, never authentication failure or native empty.
- Project entry roles (`searchbox`, `combobox`, `textbox`) only through the closed exact accessible-name allowlist `Search` and `Search by title, skill, or company`; project navigation roles (`link`, `button`) only through `Search` and `Click to start a search`. Query each role/name pair directly, count visible allowed matches across the finite projection, and require exactly one visible allowed match. Never use regex/fuzzy names or enumerate generic element collections.
- If authenticated navigation exposes exactly one evidenced native Search navigation control, the shared contract permits exactly one in-origin activation and one repeat of that same finite projection. Never guess a URL, selector, or fallback control.
- With `targetMatched=true`, a missing entry remains `linkedin_authenticated_feed` / `linkedin_authenticated_feed_navigation`; reserve `linkedin_target_unavailable` / `target_unavailable` for `targetMatched=false`.
- Require results/category landmarks only after a query interaction begins.
- Search terms use a keyword phrase or natural-language query. Preserve entity labels and reject companies, products, and people as phrase completions.
- Hashtags use `#` plus an unspaced phrase, but LinkedIn currently documents that suggested searches do not suggest hashtags. Make the initial and one refinement attempt, then return justified zero unless an exact native hashtag suggestion appears.
- For result samples record excerpt, author/organization, relative time, and visibly labelled reactions/comments/reposts.
- Recommend 3–5 search terms or 1–3 hashtags only when supported.
