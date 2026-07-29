# Local browser QA channel matrix

Use this matrix with the
[local Codex QA worker runbook](runbooks/qa-worker.md). Semantic landmarks are
structural labels, not selectors or copied page text.

| Channel | Allowed browser/access | Search entry checkpoint | Hashtag expectation | Acceptable preflight outcomes |
| --- | --- | --- | --- | --- |
| Facebook | Existing visible Chrome; authenticated | Facebook identity, authenticated navigation, native Search control | Supported when exact native evidence is available | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| Instagram | Existing visible Chrome; authenticated | Instagram identity, Explore/Search controls | Supported when exact native hashtag evidence is available | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| LinkedIn | Existing visible Chrome; authenticated only | `linkedin_native_search_entry` | Bounded initial plus one refinement; justified zero when LinkedIn supplies no exact native hashtag suggestion | `ready` only with search entry; otherwise `ui_change`, commonly `linkedin_authenticated_feed` / `linkedin_authenticated_feed_navigation` |
| X | Existing visible Chrome; authenticated | Authenticated navigation and Search query control | Supported when exact native evidence is available | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| TikTok | Existing visible Chrome or permitted public Codex in-app Browser | TikTok identity, native Search control, result-type landmarks | Supported; public availability may change | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| YouTube | Existing visible Chrome or permitted public Codex in-app Browser | YouTube identity, Search control, native result/filter landmarks | Supported when exact hashtag suggestion/result evidence is available | `ready`, `authentication_required`, `challenge`, `locale_mismatch`, `ui_change` |
| Pinterest | Existing visible Chrome preferred; permitted public Codex in-app Browser for search terms | `pinterest_search_control` on personal/public search route | Always `not_applicable` in v1; do not open a browser for hashtag | Search term may be `ready`; Business Hub/root redirect without Search is `ui_change`, never challenge or native empty |

## Enumerated LinkedIn diagnostics

Routes:

- `linkedin_search`
- `linkedin_authenticated_feed`

Expected landmark:

- `linkedin_native_search_entry`

Observed landmarks:

- `linkedin_native_search_entry`
- `linkedin_authenticated_feed_navigation`

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
| Authentication pause | `authentication_required`; same run and step preserved until manual user sign-in |
| Challenge | Visible `challenge`; no bypass |
| Missing UI | `ui_change` with enumerated expected and observed landmarks |
| Pinterest hashtag | `not_applicable` without browser evidence |
| Provider/API observation | Optional enrichment only; never substitutes for native evidence |

Autocomplete order and visible engagement are descriptive evidence only. They
must never be represented as popularity, performance, or future-reach proof.
