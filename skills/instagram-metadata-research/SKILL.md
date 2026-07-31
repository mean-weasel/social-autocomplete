---
name: instagram-metadata-research
description: Research Instagram hashtags with current authenticated native evidence and return explicit not-applicable for search-term autocomplete.
---

# Instagram metadata research

Follow [the shared browser research contract](../_shared/browser-research-contract.md), then use the `instagram` playbook selected by the router.

- Require a user-controlled signed-in Chrome session; public completion is not allowed.
- Create a new plugin-owned agent tab at the typed official root `https://www.instagram.com/`; never search for or reuse an existing Instagram tab.
- Require `targetMatched=true`. Only `instagram_search` with expected and observed `instagram_native_search_entry` may proceed. `instagram_authenticated_shell` with `instagram_authenticated_navigation`, or `instagram_target_unavailable` with `target_unavailable`, is `ui_change`.
- Project entry roles (`searchbox`, `combobox`, `textbox`) only through the closed exact accessible-name allowlist `Search` and `Search input`; project navigation roles (`link`, `button`) only through `Search`. Query each role/name pair directly, count visible allowed matches across the finite projection, and require exactly one visible allowed match. Never use regex/fuzzy names or enumerate generic element collections.
- If authenticated navigation exposes exactly one evidenced native Search navigation control, the shared contract permits exactly one in-origin activation and one repeat of that same finite projection. Never guess a URL or selector.
- With `targetMatched=true`, a missing entry remains `instagram_authenticated_shell` / `instagram_authenticated_navigation`; reserve `instagram_target_unavailable` / `target_unavailable` for `targetMatched=false`.
- Require native result landmarks only after a query interaction begins.
- After filling a prefix into the exact entry, prefer its `aria-controls` or `aria-owns` relationship. When both are absent, permit one bounded input-anchored fallback: ascend at most six element ancestors, stop before `body`, and select the nearest ancestor having exactly one direct child containing the input, no candidate links in that input branch, and exactly one other direct child containing visible `link` candidates. Scope at most ten candidates to that unique sibling. Keep relationship values and candidate URLs runtime-private; URLs may only classify candidate kind or derive an exact hashtag slug. Never inspect page-wide candidates. Missing, multiple, conflicting, or empty bounded ownership is `ui_change`, not native empty.
- Return `search-term` as `not_applicable` with reason `native_phrase_autocomplete_not_available` without opening a browser for that module. Instagram's action to search the agent's typed text is not a platform-generated phrase recommendation.
- Hashtags use `#` plus an unspaced phrase.
- Preserve personalization and restricted-hashtag states. Reject restricted tags with the visible native reason.
- Never treat a login screen, missing dropdown, or restricted tag as native empty.
- For result samples record caption summary, account, content type, relative time, and visibly labelled engagement.
- Recommend 3–5 hashtags when evidence supports them. Result-based validation of agent-proposed Instagram keywords is a separate future capability.
