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
  assert.equal(codex.skills, "./skills/");
});

test("plugin package is self-contained", async () => {
  const packageJson = await json("package.json");
  const files = packageJson.files as string[];
  for (const required of [".codex-plugin", ".claude-plugin", "assets", "bin", "dist/src", "schemas", "skills"]) {
    assert.ok(files.includes(required), required);
  }
  const cli = await readFile("bin/social-metadata.js", "utf8");
  assert.match(cli, /dist\/src\/cli\/main\.js/);
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
  assert.doesNotMatch(skill, /--input\b/);
  assert.match(skill, /social-metadata plan --json @plan-input\.json/);
  assert.match(skill, /social-metadata record-observation --run <run-id> --json @observation\.json/);
  assert.match(skill, /social-metadata validate --run <run-id>/);
});
