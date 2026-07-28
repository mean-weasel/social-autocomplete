import assert from "node:assert/strict";
import { playbooks } from "../../src/channels/playbooks/index.js";

const entries = Object.entries(playbooks);
assert.equal(entries.length, 7);

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...objectKeys(child)]);
}

for (const [channel, playbook] of entries) {
  assert.equal(playbook.channel, channel);
  assert.deepEqual(Object.keys(playbook.modules).sort(), ["hashtag", "search-term"]);
  assert.deepEqual(
    playbook.steps.map(({ id }) => id),
    ["verify-surface", "enter-prefix", "capture-suggestions", "record-decisions", "sample-results", "validate"],
  );
  assert.equal(new Set(playbook.semanticCheckpoints.map(({ id }) => id)).size, playbook.semanticCheckpoints.length);
  assert.equal(playbook.resultSample.maxResultsPerCandidate, 3);
  assert.equal(playbook.resultSample.skipSponsored, true);
  assert.equal(playbook.resultSample.engagementIsDescriptiveOnly, true);
  assert.ok(playbook.evidenceSources.every((source) => source.startsWith("https://")));
  for (const prohibited of ["publishing", "composer interaction", "scraping or crawling"]) {
    assert.ok(playbook.prohibitedActions.includes(prohibited), `${channel}: ${prohibited}`);
  }
  assert.equal(objectKeys(playbook).some((key) => /selector|css|xpath/i.test(key)), false);
}

for (const channel of ["facebook", "instagram", "linkedin", "x"] as const) {
  assert.equal(playbooks[channel].publicCompletion, false);
  assert.deepEqual(playbooks[channel].supportedBrowsers.codex, ["chrome"]);
}
for (const channel of ["tiktok", "youtube", "pinterest"] as const) {
  assert.equal(playbooks[channel].publicCompletion, true);
  assert.ok(playbooks[channel].supportedBrowsers.codex.includes("in_app"));
}

assert.equal(playbooks.pinterest.modules.hashtag.support, "not_applicable");
assert.equal(playbooks.pinterest.modules["search-term"].support, "supported");
assert.deepEqual(playbooks.linkedin.modules.hashtag.acceptedCandidateKinds, ["native_hashtag"]);
assert.match(playbooks.linkedin.modules.hashtag.caveat ?? "", /do not suggest hashtags/i);
for (const moduleName of ["hashtag", "search-term"] as const) {
  assert.ok(playbooks.x.modules[moduleName].excludedCandidateKinds.includes("search_action"));
  assert.ok(playbooks.x.modules[moduleName].excludedCandidateKinds.includes("account"));
}

process.stdout.write(`${JSON.stringify({ ok: true, playbooks: entries.length })}\n`);
