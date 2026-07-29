import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderManagerPrompt } from "../../scripts/browser-acceptance/render-qa-manager-prompt.mjs";

const templatePath =
  "docs/browser-acceptance/templates/qa-manager-launch-prompt.md";

test("manager launch template has a stable contract and complete placeholders", async () => {
  const template = await readFile(templatePath, "utf8");
  assert.match(template, /^QA manager launch prompt contract: qa-manager-launch\/v1/);
  assert.deepEqual(
    [...template.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]),
    [
      "PRODUCT_REPOSITORY",
      "QA_REPOSITORY",
      "EXPECTED_PRODUCT_COMMIT",
      "QA_MODE",
    ],
  );
});

test("documented launch command emits a copy-ready prompt without the npm banner", async () => {
  const [readme, runbook] = await Promise.all([
    readFile("docs/browser-acceptance/README.md", "utf8"),
    readFile("docs/browser-acceptance/qa-manager-runbook.md", "utf8"),
  ]);
  assert.match(readme, /npm run --silent qa:manager:prompt --/);
  assert.match(runbook, /npm run --silent qa:manager:prompt --/);
});

test("rendered manager prompt resolves ownership, paths, mode, and commit", async () => {
  const rendered = await renderManagerPrompt({
    productRepository: "/example/product",
    qaRepository: "/example/qa-worker",
    productCommit: "0123456789abcdef",
    mode: "configure_and_run",
  });

  assert.doesNotMatch(rendered, /\{\{[A-Z0-9_]+\}\}/);
  assert.match(rendered, /Product repository: \/example\/product/);
  assert.match(rendered, /Dedicated QA worker repository: \/example\/qa-worker/);
  assert.match(rendered, /Expected product commit at launch: 0123456789abcdef/);
  assert.match(rendered, /Manager mode: configure_and_run/);
  assert.match(rendered, /manager configuration is product-repository owned/i);
  assert.match(rendered, /QA repository is\s+worker-only/);
  assert.match(rendered, /explicitly approved/);
  assert.match(rendered, /manager must not\s+operate the browser/);
  assert.match(rendered, /Never request or handle credentials/);
});
