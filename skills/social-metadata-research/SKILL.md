---
name: social-metadata-research
description: Orchestrate browser-first hashtag and search-term research for a social post idea, caption, image, app, or messaging context. Use for natural-language requests or direct guided/automatic research runs.
---

# Social metadata research

Research attention-relevant metadata without publishing or changing the user's creative unless they ask afterward.

## Start the run

1. Understand the supplied caption, image, app, or messaging context.
2. Infer topic, locale, channels, modules, evidence tier, and orchestration mode. By default select both `hashtag` and `search-term`, use fresh research, and use `autocomplete_only`.
3. Present those inferred values and ask for confirmation before any channel research. Always offer:
   - `guided`: two approvals per channel, first for initial query prefixes and then for the single refinement round if needed.
   - `automatic`: the agent chooses prefixes and candidates after the initial confirmation; ask again only for an interruption or material plan amendment.
4. Call the bundled CLI as a subprocess and consume its JSON stdout directly:

   ```sh
   social-metadata plan --json @plan-input.json
   social-metadata record-observation --run <run-id> --json @observation.json
   social-metadata validate --run <run-id>
   ```

The CLI stores project-local private working data under `.social-metadata/`. It never controls the browser or chooses candidates.

## Required browser and sign-in model

Use only a user-visible browser session owned by the host:

- For authenticated research, attach to the user's existing Chrome profile. The user may already be signed in to the requested channels.
- If a channel is signed out, record `authentication_required`, pause the same run, and ask the user to sign in manually in that browser. Resume only after the user confirms sign-in and the channel checkpoints are re-verified.
- For permitted public research, Codex may use its host-managed in-app Browser.

Do not launch or fall back to a temporary, profile-less Playwright/Chromium instance. Even if such a browser could open the public site, it is not an approved plugin browser surface and cannot stand in for the user's authenticated session.

The plugin and CLI never request, receive, type, read, transmit, or store passwords, one-time codes, cookies, access tokens, browser storage state, or account identifiers. Authentication and challenges are always completed by the user in the visible browser.

## Research channels

Pause before each channel, select its dedicated skill, and follow the [shared research contract](../_shared/browser-research-contract.md). Use the thin router policy to choose the allowed browser:

- Codex: Chrome for authenticated sessions; in-app Browser only for public TikTok, YouTube, or Pinterest search-term research.
- Claude: Claude in Chrome. If unavailable, return a visible capability interruption.

Dedicated skills:

- [Facebook](../facebook-metadata-research/SKILL.md)
- [Instagram](../instagram-metadata-research/SKILL.md)
- [LinkedIn](../linkedin-metadata-research/SKILL.md)
- [X](../x-metadata-research/SKILL.md)
- [TikTok](../tiktok-metadata-research/SKILL.md)
- [YouTube](../youtube-metadata-research/SKILL.md)
- [Pinterest](../pinterest-metadata-research/SKILL.md)

After each channel, validate and return its incremental result. Resume the same run after user-completed authentication or an assisted UI-change recovery. Do not silently switch browser profiles, evidence tiers, or browser access modes.

## Finish

Return timestamped, locale-specific channel receipts and a combined JSON result. Clearly distinguish autocomplete evidence from inspected-result relevance. Do not describe autocomplete order or visible engagement as proof of popularity or future performance.
