import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkReleaseVersion,
  setReleaseVersion,
} from "../../scripts/release/version.mjs";

async function fixture(version = "0.1.0") {
  const root = await mkdtemp(join(tmpdir(), "social-metadata-version-"));
  await Promise.all([
    writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", version })),
    writeFile(join(root, "package-lock.json"), JSON.stringify({
      name: "fixture", version, packages: { "": { name: "fixture", version } },
    })),
    writeFile(join(root, ".codex-plugin.json"), JSON.stringify({ version })),
    writeFile(join(root, ".claude-plugin.json"), JSON.stringify({ version })),
  ]);
  await mkdir(join(root, ".codex-plugin"));
  await mkdir(join(root, ".claude-plugin"));
  await rename(join(root, ".codex-plugin.json"), join(root, ".codex-plugin/plugin.json"));
  await rename(join(root, ".claude-plugin.json"), join(root, ".claude-plugin/plugin.json"));
  return root;
}

test("checks and synchronizes every release version source", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await checkReleaseVersion(root)).version, "0.1.0");
  const result = await setReleaseVersion(root, "0.2.0-alpha.1");
  assert.equal(result.version, "0.2.0-alpha.1");
  assert.equal(JSON.parse(await readFile(join(root, "package-lock.json"))).packages[""].version,
    "0.2.0-alpha.1");
});

test("rejects cachebusters, mismatches, and tag disagreement", async (t) => {
  const root = await fixture();
  const otherRoot = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(otherRoot, { recursive: true, force: true }));
  const codexPath = join(root, ".codex-plugin/plugin.json");
  const codex = JSON.parse(await readFile(codexPath));
  codex.version = "0.1.0+codex.local";
  await writeFile(codexPath, JSON.stringify(codex));
  await assert.rejects(checkReleaseVersion(root), /not synchronized/u);
  await assert.rejects(setReleaseVersion(root, "0.2.0+build"), /without build metadata/u);
  await assert.rejects(checkReleaseVersion(otherRoot, "0.2.0"), /does not match/u);
});
