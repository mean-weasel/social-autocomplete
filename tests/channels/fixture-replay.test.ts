import assert from "node:assert/strict";
import { test } from "node:test";
import { runChannelFixtureReplay } from "./fixture-replay.js";

test("channel fixtures replay success, zero, interruption, failure, and Pinterest N/A", async () => {
  assert.deepEqual(await runChannelFixtureReplay(), { channels: 7, cases: 29 });
});
