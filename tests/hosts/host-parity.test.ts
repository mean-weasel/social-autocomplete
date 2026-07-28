import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHostParity } from "./host-parity.js";

test("Codex and Claude preserve one orchestration contract", async () => {
  assert.deepEqual(await checkHostParity(), { ok: true, hosts: 2, skills: 8 });
});
