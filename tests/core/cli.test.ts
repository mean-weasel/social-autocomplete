import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cli = resolve("bin/social-metadata.js");

async function invoke(args: string[], cwd: string): Promise<{ output: any; code: number }> {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], { cwd });
    return { output: JSON.parse(result.stdout), code: 0 };
  } catch (error) {
    const failure = error as Error & { stdout: string; code: number };
    return { output: JSON.parse(failure.stdout), code: failure.code };
  }
}

test("CLI emits one JSON envelope and keeps stdout clean", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-cli-"));
  const fixture = JSON.parse(await readFile(resolve("fixtures/core/plan-request.json"), "utf8")) as Record<string, unknown>;
  fixture.runId = "run_cli";
  const result = await invoke(["plan", "--json", JSON.stringify(fixture)], cwd);
  assert.equal(result.code, 0);
  assert.equal(result.output.contractVersion, "1.0");
  assert.equal(result.output.command, "plan");
  assert.equal(result.output.ok, true);
});

test("CLI failure emits one JSON envelope with exit 2", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "social-metadata-cli-error-"));
  const result = await invoke(["not-a-command"], cwd);
  assert.equal(result.code, 2);
  assert.equal(result.output.command, "unknown");
  assert.equal(result.output.ok, false);
  assert.equal(result.output.errors[0].code, "unknown_command");
});
