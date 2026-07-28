import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("diagnostic fixtures distinguish empty, auth, UI change, load failure, and locale", async () => {
  const fixtures = JSON.parse(await readFile("fixtures/diagnostics/surface-cases.json", "utf8"));
  assert.deepEqual(
    fixtures.map((fixture: { id: string }) => fixture.id),
    ["ready", "missing-search-ui", "moved-search-ui", "login-consent", "challenge", "native-empty", "load-failure", "locale-mismatch"],
  );
  for (const fixture of fixtures) {
    const input = {
      ...fixture,
      host: "codex",
      browser: "chrome",
      channel: "youtube",
      module: "search-term",
      accessClass: "authenticated",
      locale: { uiLocale: "en-US", region: "US", timezone: "America/Phoenix" },
    };
    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/browser-acceptance/run.mjs",
      "--input",
      JSON.stringify(input),
    ]);
    const receipt = JSON.parse(stdout).receipt;
    assert.equal(receipt.status, fixture.expectedStatus, fixture.id);
    assert.equal(receipt.reasonCode ?? null, fixture.expectedReason, fixture.id);
    assert.equal(receipt.screenshot.captured, fixture.screenshotDefault, fixture.id);
  }
});
