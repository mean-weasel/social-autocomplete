---
name: social-metadata-research
description: Orchestrate browser-first hashtag and search-term research for a social post idea, caption, image, app, or messaging context. Use for natural-language requests or direct guided/automatic research runs.
---

# Social metadata research

Research attention-relevant metadata without publishing or changing the user's creative unless they ask afterward.

## Start the run

1. Before creating a plan or opening any channel, ask the user to choose and confirm the browser for this run:
   - `chrome`: the user's existing, visible Chrome session. Required for Facebook, Instagram, LinkedIn, X, and all authenticated research.
   - `in_app`: the Codex built-in Browser. Limited to permitted public TikTok or YouTube research and Pinterest `search-term` research.
2. Record the confirmed choice in `browserSelection` with `confirmedByUser: true`. Establish that host browser binding once and reuse it for every channel while the choice remains effective.
3. Ask explicitly: **"Which channels should I research, and in what order?"** Present all supported choices: Facebook, Instagram, LinkedIn, X, TikTok, YouTube, and Pinterest. The user may accept an agent-proposed list, but a proposal is never a default or a substitute for this explicit choice.
4. Record the user's confirmed ordered list as `channels` in the new plan. On every new run, ask again and create a new `runId`; never inherit channels from a previous run. When explicitly resuming an existing `runId`, reuse its recorded channels without asking again.
5. Understand the supplied caption, image, app, or messaging context.
6. Infer topic, locale, modules, evidence tier, and orchestration mode. By default select both `hashtag` and `search-term`, use fresh research, and use `autocomplete_only`.
7. Present those inferred values, the confirmed ordered channels, the browser choice, and any compatibility limits, then ask for confirmation before any channel research. Always offer:
   - `guided`: two approvals per channel, first for initial query prefixes and then for the single refinement round if needed.
   - `automatic`: the agent chooses prefixes and candidates after the initial confirmation; ask again only for an interruption or material plan amendment.
8. Call the bundled CLI as a subprocess and consume its JSON stdout directly:

   ```sh
   social-metadata plan --json @plan-input.json
   social-metadata record-observation --run <run-id> --json @observation.json
   social-metadata validate --run <run-id>
   ```

The CLI stores project-local private working data under `.social-metadata/`. It never controls the browser or chooses candidates.

The user may change the browser later. Record the new confirmed choice as an append-only plan amendment before using it. A browser change is allowed before a channel starts or after an interruption that recorded no native evidence. It is not allowed after native evidence has been recorded for the active channel. Never switch browsers merely because the selected browser is signed out or incompatible.

Channel selection is immutable within a run. To research a different channel list, start a new run and ask the explicit channel-choice question again.

## Required browser and sign-in model

Use only a user-visible browser session owned by the host:

- For authenticated research, attach to the user's existing Chrome profile. The user may already be signed in to the requested channels.
- Before authenticated research, follow the canonical [sanitized authentication preflight](../../docs/browser-acceptance/README.md#sanitized-authentication-preflight): filter to the expected channel target inside the browser-control process, discard non-matches there, and return only structural booleans, sanitized status, and short expected/observed semantic landmarks.
- If a channel is signed out, record `authentication_required`, pause the same run, and ask the user to sign in manually in that browser. Resume only after the user confirms sign-in and the channel checkpoints are re-verified.
- For permitted public research, Codex may use its host-managed in-app Browser.

Do not launch or fall back to a temporary, profile-less Playwright/Chromium instance. Even if such a browser could open the public site, it is not an approved plugin browser surface and cannot stand in for the user's authenticated session.

The plugin and CLI never request, receive, type, read, transmit, or store passwords, one-time codes, cookies, access tokens, browser storage state, or account identifiers. Authentication and challenges are always completed by the user in the visible browser.

Never return a complete open-tab list or unfiltered target collection. Never
return or retain full authenticated DOM snapshots, raw HTML, `body` text, feed
content, tab titles or URLs, or account identifiers. A failed structural check
must return a sanitized interruption; it must not trigger a broader tab or DOM
read.

## Research channels

Pause before each channel, select its dedicated skill, and follow the [shared research contract](../_shared/browser-research-contract.md). Use the thin router policy to choose the allowed browser:

- Read `nextAction.browserSelection` and reuse that exact host browser binding.
  Before every channel, establish and verify that binding in the current task
  turn before considering the browser action started. Never assume a Chrome or
  in-app Browser runtime object survives a Codex turn, task, or process
  boundary. If reconnection fails, pause visibly as
  `browser_binding_unavailable` while the channel action remains unstarted.
- Codex: Chrome for authenticated sessions; in-app Browser only for public TikTok or YouTube research, or Pinterest search-term research.
- Claude: Claude in Chrome. If unavailable, return a visible capability interruption.

Referenced channel playbooks (packaged resources used by this orchestrator, not
separate required top-level Codex catalog entries):

- [Facebook](../facebook-metadata-research/SKILL.md)
- [Instagram](../instagram-metadata-research/SKILL.md)
- [LinkedIn](../linkedin-metadata-research/SKILL.md)
- [X](../x-metadata-research/SKILL.md)
- [TikTok](../tiktok-metadata-research/SKILL.md)
- [YouTube](../youtube-metadata-research/SKILL.md)
- [Pinterest](../pinterest-metadata-research/SKILL.md)

After each channel, validate and return its incremental result. Resume the same run after user-completed authentication or an assisted UI-change recovery. Do not silently switch browser surfaces, browser profiles, evidence tiers, or browser access modes.

## Finish

Return timestamped, locale-specific channel receipts and a combined JSON result. Clearly distinguish autocomplete evidence from inspected-result relevance. Do not describe autocomplete order or visible engagement as proof of popularity or future performance.
