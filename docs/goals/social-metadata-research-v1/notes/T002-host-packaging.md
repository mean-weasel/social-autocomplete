# T002 Host Packaging and Toolchain Evidence

## Confirmed Codex facts

- Every distributable Codex plugin has `.codex-plugin/plugin.json`.
- A skills-only package may expose root-level `skills/`; only `plugin.json` belongs inside `.codex-plugin/`.
- Repo marketplaces live at `.agents/plugins/marketplace.json`. Plugin entries point at a plugin root with a `./`-prefixed path relative to the marketplace root.
- Current CLI authoring commands include:
  - `codex plugin marketplace add <source> --json`
  - `codex plugin add <plugin>@<marketplace> --json`
- Codex/ChatGPT can use the user’s authenticated Chrome session through the Chrome plugin.
- Codex also has an in-app Browser surface. The approved product policy remains: prefer Chrome for authenticated research and the in-app browser for permitted public surfaces.

Primary source:

- https://developers.openai.com/plugins/build/plugins

Current-environment corroboration:

- `codex-cli 0.146.0-alpha.3.1`
- `codex plugin --help`
- Installed GoalBuddy and Browser plugin manifests under `~/.codex/plugins/cache/`

## Confirmed Claude Code facts

- Claude Code plugins use `.claude-plugin/plugin.json`; the manifest is optional in general but required here for a stable distributable identity.
- Only `plugin.json` belongs inside `.claude-plugin/`.
- Root-level plugin components include `skills/`, `agents/`, `hooks/`, `.mcp.json`, `.lsp.json`, and `bin/`.
- Plugin skills are namespaced by the manifest `name`.
- `claude plugin validate --strict <path>` is the authoritative local manifest validation command.
- `claude --plugin-dir <plugin-root>` is the direct local development smoke path.
- Marketplace-installed plugins are copied to `~/.claude/plugins/cache` and cannot reference files outside the plugin root.
- Claude Code’s supported browser integration uses Claude in Chrome. It shares the user’s logged-in browser state, pauses for login pages and CAPTCHAs, and requires a direct Anthropic login/plan rather than API-key-only or third-party-provider authentication.

Primary sources:

- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/chrome

Current-environment corroboration:

- `Claude Code 2.1.156`
- `claude plugin validate --help`
- Installed GoalBuddy `.claude-plugin/plugin.json`

## Package decision

Use one self-contained dual-host plugin root at the repository root:

```text
.codex-plugin/plugin.json
.claude-plugin/plugin.json
skills/
bin/
assets/
```

The root is also the standalone npm package. This avoids duplicated playbooks and prevents Claude cache installs from depending on files outside the plugin root. Codex and Claude manifests contain only host-specific metadata; the skill and CLI behavior remain canonical and shared.

For local Codex installation tests, create a temporary marketplace that contains or copies the complete package and points its `.agents/plugins/marketplace.json` entry at that copied plugin root. For Claude, run strict manifest validation and load the same root with `--plugin-dir`; marketplace validation remains an additional distribution check.

## Toolchain decision

- Use npm and commit `package-lock.json`.
- Set the supported runtime floor to Node.js 22.
- Exercise Node.js 22 and Node.js 24 in release verification where the available environment permits.
- Prefer Node.js 24 for release CI because it is the latest LTS line; retain Node.js 22 compatibility because it is still supported and is the current local runtime.
- Do not target Node.js 20, which is end-of-life.

Primary source:

- https://nodejs.org/en/about/previous-releases

Current environment:

- Node.js `v22.22.3`
- npm `10.9.8`

## Required board amendments

1. T003 must set `engines.node` to `>=22`, use npm, and keep Node 22/24 compatibility in mind.
2. T007 must write canonical playbooks under root-level `skills/`.
3. T008 must own root `.codex-plugin/`, `.claude-plugin/`, shared `skills/`, and plugin packaging tests rather than separate `plugin/codex` and `plugin/claude` trees.
4. T008 verification must include `claude plugin validate --strict .` and a real Codex temporary-marketplace install smoke.
5. Browser acceptance must model Codex Chrome plus in-app Browser, and Claude Chrome only. Claude browser unavailability is an explicit capability interruption, never a silent fallback.
