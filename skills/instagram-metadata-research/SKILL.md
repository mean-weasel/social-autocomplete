---
name: instagram-metadata-research
description: Research Instagram hashtag and search-term suggestions with current authenticated native evidence.
---

# Instagram metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `instagram` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Verify Instagram identity, authenticated Search & Explore, and native result landmarks.
- Search terms use ordinary phrases; hashtags use `#` plus an unspaced phrase.
- Preserve personalization and restricted-hashtag states. Reject restricted tags with the visible native reason.
- Never treat a login screen, missing dropdown, or restricted tag as native empty.
- For result samples record caption summary, account, content type, relative time, and visibly labelled engagement.
- Recommend 3–5 search terms or 3–5 hashtags when evidence supports them.
