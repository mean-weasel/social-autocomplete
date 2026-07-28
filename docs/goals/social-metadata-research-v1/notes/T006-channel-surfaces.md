# T006 — Current channel search surfaces

Observed 2026-07-27 in `en-US` browser UI. This note records only bounded,
visible UI evidence and primary official documentation. No credentials, account
identifiers, cookies, raw DOM dumps, or screenshots are retained.

## Access and support matrix

| Channel | Browser evidence | Access observed | Search-term autocomplete | Hashtag path | Result sample fields |
|---|---|---|---|---|---|
| Facebook | Chrome login surface; official Help | Signed out; authenticated acceptance unavailable | Not observed | Official Help confirms hashtag search and related hashtags; live autocomplete unavailable | Officially limited to posts visible to the signed-in user; live fields remain an acceptance gap |
| Instagram | Chrome login surface; official Help | Signed out; authenticated acceptance unavailable | Not observed | Official Help confirms hashtag pages/search results and restricted hashtags; live autocomplete unavailable | Public tagged posts may appear on hashtag pages; live fields remain an acceptance gap |
| LinkedIn | Authenticated Chrome plus official Help | Authenticated | Yes: phrase suggestions plus typed entities with visible Product, Company, or member context | Search accepts hashtags, but official Help says suggestions do **not** suggest hashtags; current `#remote` input produced non-hashtag suggestions with the `#` removed | Post excerpt, author/type, relative time, reactions, comments, reposts, poll votes where present |
| X | Authenticated Chrome plus official Help | Authenticated | Limited: exact “Search for …” action plus account suggestions; no phrase-completion set observed | Officially searchable; exact hashtag query is valid. Hashtag autocomplete beyond the exact search action was not observed | Top/Latest/People/Media/Lists tabs; post text/time; replies, reposts, likes, bookmarks, views |
| TikTok | Authenticated Chrome, signed-out in-app Browser, official Support | Authenticated and public search both available | Search control present; dropdown capture was not reliable enough to certify suggestions | Search results visibly contain hashtags; hashtag autocomplete remains an acceptance check | Top/Users/Videos/LIVE/Photo; caption, creator, date, hashtags, and a visible card count. Do not assign a meaning to an unlabeled count |
| YouTube | Authenticated Chrome, public in-app Browser, official Help | Authenticated and public search both available | Yes: visible role-option phrases for an exact typed prefix | Yes: visible `#` suggestions; official Help confirms hashtag search | Title, channel, views, age; result tabs/filters. Sponsored results must be identified and may be skipped |
| Pinterest | Signed-out Chrome plus official Help | Public search available; authenticated acceptance unavailable | Officially supports suggested topics and query refinements; refinement buttons were visible, but a dropdown was not observed in this pass | `not_applicable` by the approved v1 support matrix | Pin/product title, accessible label, destination type, and visible price when present; no reliable engagement field on search cards |

## Semantic checkpoints

### Facebook

- A valid authenticated run must expose a Facebook search landmark before any
  prefix is entered.
- The signed-out surface exposes only login controls; this is
  `authentication_required`, never a zero outcome.
- Official Help states that hashtag search is available from the top search bar
  and that results are permission-scoped to posts shared with the user.
- Acceptance prerequisite: user-controlled signed-in Chrome session.

### Instagram

- A valid authenticated run must expose the left-side Search entry or the
  Search & Explore search field, not merely the public login page.
- The signed-out surface is `authentication_required`.
- Official Help identifies accounts, hashtags, audio, tags, and places as search
  history/search domains and documents hashtag pages and restricted hashtags.
- Explore and search are personalized; record `personalizedSession: true`.
- Acceptance prerequisite: user-controlled signed-in Chrome session.

### LinkedIn

- Search landmark: top textbox currently labelled `I'm looking for…`.
- Autocomplete list mixes ordinary query phrases and entities. Preserve visible
  auxiliary entity labels rather than treating every option as a term.
- Results may default to Posts and expose category/filter controls.
- Hashtag links in posts route back through LinkedIn search.
- LinkedIn’s current Help explicitly says suggested searches do not suggest
  hashtags. Under the approved exact-suggestion contract, the hashtag module
  must perform its bounded attempts/refinement and return `zero` when no exact
  native hashtag suggestion appears. It is not `not_applicable`.

### X

- Search landmark: combobox currently labelled `Search query`.
- The suggestion surface can contain one exact “Search for …” action followed
  by account suggestions; capture and classify these separately.
- Result landmarks: Top, Latest, People, Media, and Lists.
- Visible engagement can include replies, reposts, likes, bookmarks, and views.
- Search results are affected by safe-search, blocked/muted accounts, location,
  language, and the signed-in session. Record personalization and filters.

### TikTok

- Search landmark is visibly labelled `Search`; the page can expose a semantic
  searchbox even when a DOM snapshot is sparse.
- Result category controls observed: Top, Users, Videos, LIVE, and Photo.
- Result cards expose captions, hashtags, creator, date, and a visible number.
  Only record the number when its native label is available.
- Autocomplete interaction was not stable in this pass. A missing selector or
  failed fill is `ui_change`/diagnostic evidence, not native empty.
- Public search is permitted when it remains available; authenticated Chrome is
  preferred.

### YouTube

- Search landmark: expanded Search combobox.
- Public autocomplete produced visible role-option phrases for `remote work t`
  and visible hashtag options for `#remote`.
- Results expose All, Shorts, Unwatched, Watched, Videos, Recently uploaded, and
  Live filters.
- A bounded three-result sample exposed title, channel, views, and age.
- Official Help says search uses relevance, engagement, quality, and optional
  watch/search history. Autocomplete position remains observation only.

### Pinterest

- Search landmark: combobox labelled `Search`, currently with
  `data-test-id="search-box-input"`.
- Visible result-type choices included All Pins, Videos, Boards, Profiles, and
  Products; visible topic refinements appeared above results.
- Official Help says suggested topics are based on interests and what is
  trending and that typed suggestions can narrow a general query.
- A signed-out public result exposed a Pin/product accessible label and price.
- Hashtag returns `not_applicable` without browser research.

## Shared diagnostic rules

- Verify the channel, expected search landmark, visible language, and access
  state before typing.
- Record the exact prefix before capturing at most the plan-defined visible
  suggestions. Suggestion order is never popularity or performance proof.
- Distinguish ordinary phrases, accounts/entities, exact search actions, and
  channel-native type labels.
- Inspect no more than three visible, distinct, non-sponsored results per
  intended recommendation. Do not scroll or paginate beyond the plan.
- Store only short visible excerpts/summaries and native labels. Engagement is
  descriptive and non-representative.
- Login surfaces, challenges, sparse/changed landmarks, and failed interactions
  are interruptions or diagnostics, never zero results.
- A native empty outcome requires an explicit empty state or a successfully
  opened suggestion/result surface with no items—not a selector miss.

## Primary sources

- Facebook Help, “How do I use hashtags on Facebook?”:
  https://www.facebook.com/help/587836257914341
- Instagram Help search results for hashtags:
  https://www.facebook.com/help/instagram/search/?query=hashtags
- Instagram Help, “How posts are chosen for Explore”:
  https://www.facebook.com/help/487224561296752
- LinkedIn Help, “Search on LinkedIn”:
  https://www.linkedin.com/help/linkedin/answer/a523136/searching-on-linkedin
- X Help, “How to use X search”:
  https://help.x.com/en/using-x/x-search
- X Help, “How to use hashtags”:
  https://help.x.com/en/using-x/how-to-use-hashtags
- TikTok Support, “Discover and search”:
  https://support.tiktok.com/en/using-tiktok/exploring-videos/discover-and-search
- TikTok Support, “Creator Search Insights”:
  https://support.tiktok.com/en/using-tiktok/growing-your-audience/creator-search-insights
- YouTube Help, “How YouTube search works”:
  https://support.google.com/youtube/answer/16090438
- YouTube Help, “Find videos using hashtags”:
  https://support.google.com/youtube/answer/10806146
- Pinterest Help, “Discover ideas on Pinterest”:
  https://help.pinterest.com/en/article/discover-ideas-on-pinterest

## Gaps carried into acceptance

- Facebook and Instagram authenticated autocomplete and result fields.
- TikTok autocomplete and explicit label for the visible result-card count.
- Pinterest authenticated personalization and an actual autocomplete dropdown.
- X hashtag-specific suggestion behavior beyond the exact search action.
- Locale/region verification beyond visible English UI; timezone is not exposed
  by these surfaces and must come from confirmed run context.
