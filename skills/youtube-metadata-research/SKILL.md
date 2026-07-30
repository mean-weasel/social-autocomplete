---
name: youtube-metadata-research
description: Research YouTube hashtag and search-term autocomplete with current native evidence.
---

# YouTube metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `youtube` playbook selected by the router.

- Prefer signed-in Chrome. Codex may use the in-app browser for public completion.
- Create a new plugin-owned agent tab at the typed official root `https://www.youtube.com/` in either supported host; never search for or reuse an existing YouTube tab.
- Verify YouTube navigation, expanded Search combobox, and native video-result/filter landmarks.
- Search terms use ordinary phrases; hashtags use `#` plus an unspaced phrase. Both native autocomplete forms are supported.
- Capture roles/types as displayed and preserve suggestion order without treating it as popularity.
- For result samples record video title, channel, views, age, and a short visible description.
- Recommend 3–5 search terms or 1–3 hashtags.
