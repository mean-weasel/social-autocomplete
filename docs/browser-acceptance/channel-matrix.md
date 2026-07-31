# Local browser QA channel matrix

Use this matrix with the
[local Codex QA worker runbook](runbooks/qa-worker.md). Semantic landmarks are
structural labels, not selectors or copied page text.

Every browser-backed row uses one new task-scoped plugin-owned agent tab
navigated only to its typed official root. User tabs are never listed, claimed,
inspected, matched, or reused. Normal lifecycle is `created` → `released`;
`created` → `authentication_handoff` is the sole unreleased exception.

| Channel | Allowed browser/access | Search entry checkpoint | Hashtag expectation | Acceptable preflight outcomes |
| --- | --- | --- | --- | --- |
| Facebook | Existing visible Chrome; authenticated | `facebook_search` / `facebook_native_search_entry` with `targetMatched=true` | Supported when exact native evidence is available | `ready` only with the exact entry; authenticated shell or unavailable target is `ui_change` |
| Instagram | Existing visible Chrome; authenticated | `instagram_search` / `instagram_native_search_entry` with `targetMatched=true` | Supported when exact native hashtag evidence is available; search-term autocomplete is `not_applicable` | `ready` only with the exact entry; authenticated shell or unavailable target is `ui_change` |
| LinkedIn | Existing visible Chrome; authenticated only | `linkedin_native_search_entry` | Bounded initial plus one refinement; justified zero when LinkedIn supplies no exact native hashtag suggestion | `ready` only with search entry; otherwise `ui_change`, commonly `linkedin_authenticated_feed` / `linkedin_authenticated_feed_navigation` |
| X | Existing visible Chrome; authenticated | Authenticated navigation and Search query control | Supported when exact native evidence is available | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| TikTok | Existing visible Chrome or permitted public Codex in-app Browser | TikTok identity, native Search control, result-type landmarks | Supported; public availability may change | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| YouTube | Existing visible Chrome or permitted public Codex in-app Browser | YouTube identity, Search control, native result/filter landmarks | Supported when exact hashtag suggestion/result evidence is available | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| Pinterest | Existing visible Chrome preferred; permitted public Codex in-app Browser for search terms | `pinterest_search_control` on personal/public search route | Always `not_applicable` in v1; do not open a browser for hashtag | Search term may be `ready`; Business Hub/root redirect without Search is `ui_change`, never challenge or native empty |

## Enumerated Facebook diagnostics

Routes:

- `facebook_search`
- `facebook_authenticated_shell`
- `facebook_target_unavailable`

Expected landmark:

- `facebook_native_search_entry`

Observed landmarks:

- `facebook_native_search_entry`
- `facebook_authenticated_navigation`
- `target_unavailable`

## Enumerated Instagram diagnostics

Routes:

- `instagram_search`
- `instagram_authenticated_shell`
- `instagram_target_unavailable`

Expected landmark:

- `instagram_native_search_entry`

Observed landmarks:

- `instagram_native_search_entry`
- `instagram_authenticated_navigation`
- `target_unavailable`

## Enumerated LinkedIn diagnostics

Routes:

- `linkedin_search`
- `linkedin_authenticated_feed`
- `linkedin_target_unavailable`

Expected landmark:

- `linkedin_native_search_entry`

Observed landmarks:

- `linkedin_native_search_entry`
- `linkedin_authenticated_feed_navigation`
- `target_unavailable`

## Enumerated Pinterest diagnostics

Routes:

- `pinterest_public_search`
- `pinterest_personal_search`
- `pinterest_business_hub`
- `pinterest_root_after_search_redirect`

Expected landmark:

- `pinterest_search_control`

Observed landmarks:

- `pinterest_search_control`
- `pinterest_business_hub`
- `pinterest_root`

## Module and evidence expectations

| Case | Required evidence |
| --- | --- |
| `autocomplete_only` recommendation | Current exact channel-native suggestion matching the recommended value |
| `results_sample` recommendation | Exact native suggestion plus a bounded relevance sample for every recommendation |
| Zero recommendation | Planned bounded attempts, at most one refinement, current native empty/no-candidate evidence, and justification |
| Authentication pause | `authentication_required` plus `authentication_handoff`; same-task live handle retained until manual user sign-in, task-boundary recovery recreates from the official root |
| Challenge | Visible `challenge`; no bypass |
| Missing UI | `ui_change` with enumerated expected and observed landmarks |
| Instagram search term | `not_applicable` with `native_phrase_autocomplete_not_available`; typed-text search actions and profile/entity matches are not recommendations |
| Pinterest hashtag | `not_applicable` without browser evidence |
| Provider/API observation | Optional enrichment only; never substitutes for native evidence |

Autocomplete order and visible engagement are descriptive evidence only. They
must never be represented as popularity, performance, or future-reach proof.

For Facebook, Instagram, or LinkedIn, a matched authenticated shell may use
exactly one bounded recovery only when the sanitized structural projection
evidences an in-origin native Search navigation control. Activate that control
once and repeat the same projection. Do not guess a URL or selector, broaden
the read, inspect page text, or try a second recovery. Results landmarks are
required after query interaction begins, not during entry preflight.

That projection is a finite accessibility query, never a DOM scan. Use the
closed per-channel exact accessible-name allowlists: Instagram entries
`Search`/`Search input` and navigation `Search`; Facebook entry `Search
Facebook` and navigation `Search`/`Search Facebook`; LinkedIn entries
`Search`/`Search by title, skill, or company` and navigation `Search`/`Click to
start a search`. Query only `searchbox`, `combobox`, or `textbox` roles for
entries and `link` or `button` roles for navigation, one exact role/name pair
at a time. Require exactly one visible allowed match across the finite
projection before using it. Never use regex/fuzzy names or enumerate or slice
generic element collections. A matched Instagram shell or LinkedIn Feed must retain its enumerated navigation landmark;
`target_unavailable` is valid only when `targetMatched=false`.

After an exact Instagram or Facebook entry accepts a planned prefix, resolve
only that entry's `aria-controls` or `aria-owns` accessibility relationship.
Keep the relationship value inside the browser runtime, require exactly one
visible owned popup, and query only `option`, `listitem`, `link`, or `button`
roles scoped inside it. Capture at most ten visible candidates. Never query
those roles page-wide, return the relationship value, guess a selector, or
interpret absent, multiple, conflicting, or still-empty ownership as native
empty; record `ui_change` instead. LinkedIn is not authorized to use this
projection until its exact entry checkpoint passes.
