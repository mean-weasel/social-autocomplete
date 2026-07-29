#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultProductRepository = resolve(scriptDirectory, "../..");
const templatePath = resolve(
  defaultProductRepository,
  "docs/browser-acceptance/templates/qa-manager-launch-prompt.md",
);
const allowedModes = new Set(["configure", "run", "configure_and_run"]);

function parseArguments(argv) {
  const options = {
    productRepository: defaultProductRepository,
    mode: "configure_and_run",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (
      flag === "--product-repository" ||
      flag === "--qa-repository" ||
      flag === "--product-commit" ||
      flag === "--mode"
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${flag} requires a value`);
      options[
        {
          "--product-repository": "productRepository",
          "--qa-repository": "qaRepository",
          "--product-commit": "productCommit",
          "--mode": "mode",
        }[flag]
      ] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${flag}`);
  }

  if (!options.qaRepository) {
    throw new Error("--qa-repository is required");
  }
  if (!allowedModes.has(options.mode)) {
    throw new Error(
      "--mode must be configure, run, or configure_and_run",
    );
  }
  return options;
}

async function requireDirectory(path, label) {
  const details = await stat(path);
  if (!details.isDirectory()) throw new Error(`${label} must be a directory`);
}

function resolveCommit(productRepository) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: productRepository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export async function renderManagerPrompt({
  productRepository,
  qaRepository,
  productCommit,
  mode,
}) {
  const template = await readFile(templatePath, "utf8");
  const values = {
    PRODUCT_REPOSITORY: resolve(productRepository),
    QA_REPOSITORY: resolve(qaRepository),
    EXPECTED_PRODUCT_COMMIT: productCommit,
    QA_MODE: mode,
  };
  let rendered = template;
  for (const [name, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${name}}}`, value);
  }
  const unresolved = [...rendered.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map(
    (match) => match[1],
  );
  if (unresolved.length > 0) {
    throw new Error(`Unresolved prompt placeholders: ${unresolved.join(", ")}`);
  }
  return rendered;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const productRepository = resolve(options.productRepository);
    const qaRepository = resolve(options.qaRepository);
    if (!isAbsolute(productRepository) || !isAbsolute(qaRepository)) {
      throw new Error("repository paths must resolve to absolute paths");
    }
    await Promise.all([
      requireDirectory(productRepository, "product repository"),
      requireDirectory(qaRepository, "QA repository"),
    ]);
    const productCommit =
      options.productCommit ?? resolveCommit(productRepository);
    const rendered = await renderManagerPrompt({
      productRepository,
      qaRepository,
      productCommit,
      mode: options.mode,
    });
    process.stdout.write(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        code: "qa_manager_prompt_error",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
