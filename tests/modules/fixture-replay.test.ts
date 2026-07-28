import assert from "node:assert/strict";
import test from "node:test";
import { runFixtureReplay } from "./fixture-replay.js";

test("shared module fixtures replay deterministically across every channel", async () => {
  const result = await runFixtureReplay();
  assert.equal(result.cases, 8);
  assert.equal(new Set(result.ids).size, result.cases);
});
