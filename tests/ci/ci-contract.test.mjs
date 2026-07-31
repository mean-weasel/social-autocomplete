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
