import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("Codex and Claude manifests expose one shared plugin identity", async () => {
  const [codex, claude] = await Promise.all([
    json(".codex-plugin/plugin.json"),
    json(".claude-plugin/plugin.json"),
  ]);
  assert.equal(codex.name, "social-metadata-research");
  assert.equal(claude.name, codex.name);
  assert.equal(claude.version, codex.version);
  assert.equal(codex.skills, "./skills/social-metadata-research/");
});

test("plugin package is self-contained", async () => {
  const packageJson = await json("package.json");
  const files = packageJson.files as string[];
  for (const required of [".codex-plugin", ".claude-plugin", "assets", "bin", "dist/src", "schemas", "skills"]) {
    assert.ok(files.includes(required), required);
  }
  const [cli] = await Promise.all([
    readFile("bin/social-metadata.js", "utf8"),
    readFile("bin/runtime/cli/main.js", "utf8"),
  ]);
  assert.match(cli, /import "\.\/runtime\/cli\/main\.js";/);
  assert.doesNotMatch(cli, /\.\.\/\.\.\//);
});

test("primary skill supports discovery, direct invocation, and incremental research", async () => {
  const skill = await readFile("skills/social-metadata-research/SKILL.md", "utf8");
  for (const phrase of ["guided", "automatic", "initial confirmation", "After each channel", "social-metadata validate"]) {
    assert.match(skill, new RegExp(phrase, "i"), phrase);
  }
  for (const channel of ["Facebook", "Instagram", "LinkedIn", "X", "TikTok", "YouTube", "Pinterest"]) {
    assert.match(skill, new RegExp(channel));
  }
  assert.match(skill, /packaged resources used by this orchestrator/i);
  assert.match(skill, /not\s+separate required top-level Codex catalog entries/i);
  const linkedPlaybooks = [...skill.matchAll(/\]\(\.\.\/([a-z-]+-metadata-research)\/SKILL\.md\)/g)]
    .map((match) => match[1]);
  assert.deepEqual(linkedPlaybooks, [
    "facebook-metadata-research",
    "instagram-metadata-research",
    "linkedin-metadata-research",
    "x-metadata-research",
    "tiktok-metadata-research",
    "youtube-metadata-research",
    "pinterest-metadata-research",
  ]);
  for (const playbook of linkedPlaybooks) {
    await readFile(`skills/${playbook}/SKILL.md`, "utf8");
  }
  assert.doesNotMatch(skill, /--input\b/);
  assert.match(skill, /social-metadata plan --json @plan-input\.json/);
  assert.match(skill, /social-metadata record-observation --run <run-id> --json @observation\.json/);
  assert.match(skill, /social-metadata validate --run <run-id>/);
  assert.match(skill, /existing Chrome profile/i);
  assert.match(skill, /temporary, profile-less Playwright\/Chromium/i);
  assert.match(skill, /pause the same run/i);
  assert.match(skill, /sign in manually in that dedicated target/i);
  assert.doesNotMatch(skill, /sign in manually in that browser/i);
  assert.match(skill, /never request, receive, type, read, transmit, or store passwords/i);
  assert.match(skill, /Before creating a plan or opening any channel/i);
  assert.match(skill, /choose and confirm the browser/i);
  assert.match(skill, /Which channels should I research, and in what order\?/i);
  assert.match(skill, /On every new run, ask again and create a new `runId`/i);
  assert.match(skill, /never inherit channels from a previous run/i);
  assert.match(skill, /resuming an existing `runId`, reuse its recorded channels without asking again/i);
  assert.match(skill, /browserSelection/i);
  assert.match(skill, /Codex built-in Browser/i);
  assert.match(skill, /append-only plan amendment/i);
  assert.match(skill, /Never switch browsers/i);
  assert.match(skill, /sanitized authentication preflight/i);
  assert.match(skill, /create a new plugin-owned agent tab/i);
  assert.match(skill, /typed official root/i);
  assert.match(skill, /Never list, claim, inspect, or reuse user tabs/i);
  assert.match(skill, /Never list or return a complete open-tab list/i);
  assert.match(skill, /full authenticated DOM snapshots/i);
  assert.match(skill, /`body` text, feed\s+content/i);
  assert.match(skill, /account identifiers/i);
  assert.match(skill, /only structural booleans, sanitized lifecycle\/status values, a deterministic lease hash, and short expected\/observed semantic landmarks/i);
  assert.match(skill, /must not\s+trigger a broader tab or DOM\s+read/i);
});

test("authenticated Search recovery is finite, accessible, and diagnostic-safe", async () => {
  const documents = await Promise.all([
    readFile("skills/_shared/browser-research-contract.md", "utf8"),
    readFile("skills/instagram-metadata-research/SKILL.md", "utf8"),
    readFile("skills/facebook-metadata-research/SKILL.md", "utf8"),
    readFile("skills/linkedin-metadata-research/SKILL.md", "utf8"),
    readFile("docs/browser-acceptance/runbooks/qa-worker.md", "utf8"),
    readFile("docs/browser-acceptance/prompts/qa-worker-dispatch.md", "utf8"),
  ]);

  for (const document of documents) {
    assert.match(document, /exact accessible-name/i);
    for (const role of ["searchbox", "combobox", "textbox", "link", "button"]) {
      assert.match(document, new RegExp(`\\b${role}\\b`, "i"));
    }
    assert.match(document, /exactly\s+one visible/i);
    assert.match(document, /targetMatched=true/i);
    assert.match(document, /target_unavailable/i);
  }

  assert.match(documents[1], /`Search input`/);
  assert.match(documents[2], /`Search Facebook`/);
  assert.match(documents[3], /`Search by title, skill, or company`/);
  assert.match(documents[3], /`Click to start a search`/);

  for (const document of [documents[0], documents[4], documents[5]]) {
    assert.match(document, /Never (?:use |enumerate or slice )`?querySelectorAll`?/i);
  }

  for (const document of [documents[0], documents[1], documents[2], documents[4], documents[5]]) {
    assert.match(document, /`aria-controls` or `aria-owns`/i);
    assert.match(document, /runtime-private|inside the browser runtime/i);
    assert.match(document, /exactly one visible (?:owned|related) popup/i);
    assert.match(document, /at most ten visible/i);
    assert.match(document, /page-wide|page-global/i);
    assert.match(document, /native empty/i);
  }
  assert.doesNotMatch(documents[3], /`aria-controls`|`aria-owns`/i);
});
