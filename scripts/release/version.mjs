import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

export const VERSION_FILES = [
  "package.json",
  "package-lock.json",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
];
export const MARKETPLACE_FILE = ".agents/plugins/marketplace.json";
const RELEASE_SOURCE_URL = "https://github.com/mean-weasel/social-autocomplete.git";

function assertVersion(version) {
  if (!SEMVER.test(version)) {
    throw new Error(`Release version must be SemVer without build metadata: ${version}`);
  }
}

async function readJson(root, file) {
  return JSON.parse(await readFile(resolve(root, file), "utf8"));
}

export async function readReleaseVersions(root = ".") {
  const [pkg, lock, codex, claude] = await Promise.all(
    VERSION_FILES.map((file) => readJson(root, file)),
  );
  return {
    "package.json": pkg.version,
    "package-lock.json": lock.version,
    "package-lock.json#packages[\"\"]": lock.packages?.[""]?.version,
    ".codex-plugin/plugin.json": codex.version,
    ".claude-plugin/plugin.json": claude.version,
  };
}

export async function checkReleaseVersion(root = ".", expected) {
  const versions = await readReleaseVersions(root);
  const marketplace = await readJson(root, MARKETPLACE_FILE);
  const canonical = versions["package.json"];
  assertVersion(canonical);
  if (expected !== undefined) {
    assertVersion(expected);
    if (canonical !== expected) {
      throw new Error(`Tag version ${expected} does not match package version ${canonical}`);
    }
  }
  const mismatches = Object.entries(versions)
    .filter(([, version]) => version !== canonical)
    .map(([file, version]) => `${file}=${version}`);
  if (mismatches.length > 0) {
    throw new Error(`Release versions are not synchronized: ${mismatches.join(", ")}`);
  }
  const entry = marketplace.plugins?.find((plugin) => plugin.name === "social-metadata-research");
  if (entry?.source?.source !== "url" || entry.source.url !== RELEASE_SOURCE_URL) {
    throw new Error("Marketplace must install from the clean Git-backed release source");
  }
  if (entry.source.ref !== `v${canonical}`) {
    throw new Error(`Marketplace ref ${entry.source.ref} does not match v${canonical}`);
  }
  return { ok: true, version: canonical, files: [...Object.keys(versions), MARKETPLACE_FILE] };
}

export async function setReleaseVersion(root = ".", version) {
  assertVersion(version);
  const files = [...VERSION_FILES, MARKETPLACE_FILE];
  const documents = await Promise.all(files.map((file) => readJson(root, file)));
  documents[0].version = version;
  documents[1].version = version;
  if (!documents[1].packages?.[""]) {
    throw new Error("package-lock.json is missing packages[\"\"]");
  }
  documents[1].packages[""].version = version;
  documents[2].version = version;
  documents[3].version = version;
  const entry = documents[4].plugins?.find((plugin) => plugin.name === "social-metadata-research");
  if (entry?.source?.source !== "url" || entry.source.url !== RELEASE_SOURCE_URL) {
    throw new Error("Marketplace must install from the clean Git-backed release source");
  }
  entry.source.ref = `v${version}`;
  await Promise.all(documents.map((document, index) =>
    writeFile(resolve(root, files[index]), `${JSON.stringify(document, null, 2)}\n`)));
  return checkReleaseVersion(root, version);
}

async function main() {
  const [command, value] = process.argv.slice(2);
  const result = command === "check"
    ? await checkReleaseVersion(".", value)
    : command === "set" && value
      ? await setReleaseVersion(".", value)
      : null;
  if (!result) throw new Error("Usage: version.mjs check [expected] | set <version>");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
