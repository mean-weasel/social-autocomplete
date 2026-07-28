---
name: linkedin-metadata-research
description: Research LinkedIn search terms and bounded hashtag evidence in an authenticated native search session.
---

# LinkedIn metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `linkedin` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Verify LinkedIn navigation, authenticated state, top search textbox, and results/category landmarks.
- Search terms use a keyword phrase or natural-language query. Preserve entity labels and reject companies, products, and people as phrase completions.
- Hashtags use `#` plus an unspaced phrase, but LinkedIn currently documents that suggested searches do not suggest hashtags. Make the initial and one refinement attempt, then return justified zero unless an exact native hashtag suggestion appears.
- For result samples record excerpt, author/organization, relative time, and visibly labelled reactions/comments/reposts.
- Recommend 3–5 search terms or 1–3 hashtags only when supported.
