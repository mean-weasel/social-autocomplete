import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

test("standalone consumer completes plan, observations, and validation from JSON stdout", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["examples/subprocess-consumer/run.mjs"]);
  const output = JSON.parse(stdout);
  assert.equal(output.ok, true);
  assert.equal(output.status, "complete");
  assert.equal(output.channel, "youtube");
  assert.equal(output.recommendation, "remote work tips");
  assert.equal(output.consumedFrom, "stdout_json_only");
});
