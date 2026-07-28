import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeLiveReceipts } from "../../scripts/browser-acceptance/coverage.mjs";

const now = Date.parse("2026-07-28T00:30:00Z");

function receipt(channel, module, status = "pass", accessClass = "public") {
  return {
    receiptId: `receipt-${channel}-${module}-${status}`,
    capturedAt: "2026-07-28T00:24:23Z",
    channel,
    module,
    status,
    accessClass,
    interaction: {
      attempted: status === "pass",
      succeeded: status === "pass",
    },
  };
}

test("coverage requires every channel and a live pass for both modules", () => {
  const receipts = [
    receipt("facebook", "search-term", "interrupted", "authenticated"),
    receipt("instagram", "search-term", "interrupted", "authenticated"),
    receipt("linkedin", "search-term", "pass", "authenticated"),
    receipt("x", "search-term", "pass", "authenticated"),
    receipt("tiktok", "search-term", "failed"),
    receipt("youtube", "search-term"),
    receipt("pinterest", "search-term"),
  ];
  const coverage = summarizeLiveReceipts(receipts, now);
  assert.deepEqual(coverage.missingChannels, []);
  assert.deepEqual(coverage.missingPassingModules, ["hashtag"]);
  assert.equal(coverage.requirementsMet, false);
  assert.equal(coverage.failed.length, 1);
  assert.equal(coverage.interrupted.length, 2);
});

test("failed and interrupted cells remain visible and never count as passes", () => {
  const receipts = [
    receipt("facebook", "search-term", "interrupted", "authenticated"),
    receipt("instagram", "search-term", "interrupted", "authenticated"),
    receipt("linkedin", "search-term", "pass", "authenticated"),
    receipt("x", "search-term", "pass", "authenticated"),
    receipt("tiktok", "search-term", "failed"),
    receipt("youtube", "search-term"),
    receipt("youtube", "hashtag"),
    receipt("pinterest", "search-term"),
  ];
  const coverage = summarizeLiveReceipts(receipts, now);
  assert.equal(coverage.requirementsMet, true);
  assert.deepEqual(coverage.passingModules, ["hashtag", "search-term"]);
  assert.equal(coverage.failed.length, 1);
  assert.equal(coverage.interrupted.length, 2);
});

test("a pass without a successful bounded interaction is rejected", () => {
  const invalid = receipt("youtube", "hashtag");
  invalid.interaction.succeeded = false;
  assert.throws(() => summarizeLiveReceipts([invalid], now), /lacks a successful bounded interaction/);
});
