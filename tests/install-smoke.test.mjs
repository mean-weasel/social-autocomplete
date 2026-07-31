import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repo = resolve(".");
const installSmoke = join(repo, "scripts/install-smoke/run.mjs");

async function invoke(mode) {
  const directory = await mkdtemp(join(tmpdir(), "install-smoke-test-"));
  const bin = join(directory, "bin");
  await writeFile(join(directory, "codex"), `#!/bin/sh
if [ "$1" = plugin ] && [ "$2" = list ]; then
  printf '{"installed":[{"pluginId":"social-metadata-research@%s","enabled":true}]}' "$4"
elif [ "${mode}" = timeout ] && [ "$1" = plugin ] && [ "$2" = marketplace ] && [ "$3" = add ]; then
  while :; do sleep 1; done
else
  printf '{}'
fi
`);
  await writeFile(join(directory, "claude"), "#!/bin/sh\nprintf 'mock claude\\n'\n");
  await writeFile(join(directory, "bin-marker"), "");
  await new Promise((resolveReady, rejectReady) => {
    const child = spawn("chmod", ["+x", join(directory, "codex"), join(directory, "claude")]);
    child.once("error", rejectReady);
    child.once("close", (code) => code === 0 ? resolveReady() : rejectReady(new Error("chmod failed")));
  });
  const child = spawn(process.execPath, [installSmoke], {
    cwd: repo,
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      TMPDIR: directory,
      INSTALL_SMOKE_COMMAND_TIMEOUT_MS: mode === "timeout" ? "50" : "10000",
      INSTALL_SMOKE_CHILD_GRACE_MS: "50",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const result = await new Promise((resolveResult, rejectResult) => {
    const timer = setTimeout(() => rejectResult(new Error("install smoke exceeded its outer bound")), 15_000);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({ code, signal });
    });
  });
  const leftovers = (await readdir(directory)).filter((name) => name.startsWith("social-metadata-install-"));
  await rm(directory, { recursive: true, force: true });
  return { ...result, stdout, stderr, leftovers };
}

test("standalone install smoke completes with bounded Codex commands and exact cleanup", async () => {
  const result = await invoke("success");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).codexMarketplaceInstall, "pass");
  assert.deepEqual(result.leftovers, []);
});

test("standalone install smoke times out a hanging Codex command and removes its exact root", async () => {
  const result = await invoke("timeout");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /timed out after 50ms/);
  assert.deepEqual(result.leftovers, []);
});
