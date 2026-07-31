# Subprocess integration

Run the CLI as a subprocess and parse its single JSON stdout line. Do not parse
plugin prose. `contractVersion` is the compatibility boundary; commands and
receipt schemas remain versioned independently.

```sh
npm run build
npm run example:subprocess
```

The example creates private temporary state, completes
`plan -> record-observation -> validate`, consumes only stdout JSON, and removes
its state. It needs no browser, credentials, network, paid API, or external
repository.

An integrating repository supplies creative context and lets Codex or Claude
control the browser. The CLI records and validates the resulting observations.
Provider APIs, Lineage, Buffer, and GrowthOps are not runtime dependencies.

## Browser selection

Every initial plan requires a user-confirmed browser:

```json
{
  "browserSelection": {
    "browser": "chrome",
    "confirmedByUser": true
  }
}
```

Codex accepts `chrome` and `in_app`. Chrome is required for authenticated
research and for channels whose playbooks prohibit public completion. The
Codex in-app Browser is accepted only for playbook-approved public surfaces.
Every `nextAction` includes the effective `browserSelection`; subprocess
consumers must use that exact surface.

## Completed research tabs

Before each fresh run, the host asks: **"Should completed research tabs stay
open? The default is no."** It records the answer as:

```json
{ "completedResearchTabs": "close" }
```

The other accepted value is `keep_open`. Missing values from older plans retain
the backward-compatible `close` default. Every `nextAction` exposes the
effective value. Both choices release browser-session control before a normal
result: `close` closes the agent-created tab, while `keep_open` leaves that
exact tab visible as a user-facing deliverable. Retained tabs are never
rediscovered, claimed, or reused by the plugin.

The user can adjust the choice before channel-native evidence is captured, or
after an interruption that contains no native evidence:

```json
{
  "contractVersion": "1.0",
  "amendmentId": "amend_browser_1",
  "runId": "run_example",
  "reason": "The user chose the Codex built-in Browser for public YouTube research.",
  "changes": {
    "browserSelection": {
      "browser": "in_app",
      "confirmedByUser": true
    }
  }
}
```

Record it with `social-metadata plan --run run_example --json @amendment.json`.
The CLI rejects unsupported channel/browser combinations, unconfirmed choices,
mid-channel switches, authenticated in-app observations, and observations from
a browser other than the effective selection.

## Ordered channel selection

Before creating every new run, the host explicitly asks which supported
channels the user wants researched and in what order. It writes that confirmed
ordered list to the plan's required `channels` field. Agent inference may be
presented as a proposal, but it cannot silently become the selection.

```json
{
  "runId": "run_example",
  "channels": ["instagram", "youtube"]
}
```

The CLI persists channels as immutable run-plan data. `social-metadata plan
--run run_example` resumes that exact run and its recorded order without a
second prompt. A fresh research request uses a new `runId`, requires a fresh
explicit channel choice, and never copies the previous run's channels.
