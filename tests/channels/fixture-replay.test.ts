import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runChannelFixtureReplay } from "./fixture-replay.js";

test("channel fixtures replay success, zero, interruption, failure, and Pinterest N/A", async () => {
  assert.deepEqual(await runChannelFixtureReplay(), { channels: 7, cases: 29 });
});

test("channel fixtures preserve route-aware LinkedIn and Pinterest boundaries", async () => {
  const fixtures = JSON.parse(await readFile("fixtures/channels/scenarios.json", "utf8"));
  const linkedin = fixtures.find(({ channel }: { channel: string }) => channel === "linkedin");
  const pinterest = fixtures.find(({ channel }: { channel: string }) => channel === "pinterest");
  assert.equal(linkedin.success.diagnostic.routeClass, "linkedin_search");
  assert.equal(linkedin.failure.diagnostic.routeClass, "linkedin_authenticated_feed");
  assert.equal(linkedin.failure.explicitNativeEmpty, true);
  assert.equal(linkedin.failure.expected, "failed");
  assert.equal(pinterest.success.diagnostic.routeClass, "pinterest_public_search");
  assert.equal(pinterest.failure.diagnostic.routeClass, "pinterest_business_hub");
  assert.equal(pinterest.failure.expected, "failed");
  assert.equal(pinterest.notApplicableModule, "hashtag");
});
