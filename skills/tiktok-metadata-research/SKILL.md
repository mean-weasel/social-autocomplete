---
name: tiktok-metadata-research
description: Research TikTok hashtag and search-term evidence through native search, using authenticated or permitted public surfaces.
---

# TikTok metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `tiktok` playbook selected by the router.

- Prefer signed-in Chrome. Codex may use the in-app browser for public completion while native search is available.
- Create a new plugin-owned agent tab at the typed official root `https://www.tiktok.com/` in either supported host; never search for or reuse an existing TikTok tab.
- Verify TikTok identity, Search control, and Top/Users/Videos/LIVE/Photo result landmarks.
- Search terms use ordinary phrases; hashtags use `#` plus an unspaced phrase.
- Autocomplete interaction is an acceptance gap. A failed fill, missing locator, or absent dropdown is `ui_change`, never zero.
- For result samples record caption summary, creator, date, visible hashtags, and only clearly labelled metrics.
- Recommend 3–5 search terms or hashtags.
