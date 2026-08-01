import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertPackageEntries,
  REQUIRED_PACKAGE_FILES,
} from "../../scripts/ci/package-smoke.mjs";

test("CI covers pull requests, merge groups, default pushes, and one stable gate", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  for (const event of ["pull_request", "merge_group", "push"]) {
    assert.match(workflow, new RegExp(`\\b${event}:`));
  }
  assert.match(workflow, /permissions:\s+contents: read/u);
  assert.match(workflow, /name: Required/u);
  assert.match(workflow, /needs: \[repository, offline, package\]/u);
});

test("package validation rejects private state even when required files exist", () => {
  assert.doesNotThrow(() => assertPackageEntries(REQUIRED_PACKAGE_FILES));
  assert.throws(
    () => assertPackageEntries([...REQUIRED_PACKAGE_FILES, ".social-metadata/private.json"]),
    /prohibited path/u,
  );
});

test("release tags require synchronized versions and publish a checksummed package", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  assert.match(workflow, /tags: \["v\*"\]/u);
  assert.match(workflow, /permissions:\s+contents: write/u);
  assert.match(workflow, /npm run version:check/u);
  assert.match(workflow, /npm run verify:ci/u);
  assert.match(workflow, /npm pack --pack-destination dist-release/u);
  assert.match(workflow, /sha256sum .*SHA256SUMS/u);
  assert.match(workflow, /gh release create/u);
  assert.match(workflow, /--verify-tag --generate-notes/u);
});
