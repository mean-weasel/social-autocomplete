import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_PACKAGE_FILES = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "bin/social-metadata.js",
  "bin/runtime/cli/main.js",
  "schemas/v1/common/plan-request.schema.json",
  "skills/social-metadata-research/SKILL.md",
  ...["facebook", "instagram", "linkedin", "pinterest", "tiktok", "x", "youtube"]
    .map((channel) => `skills/${channel}-metadata-research/SKILL.md`),
];

export function assertPackageEntries(entries) {
  const files = new Set(entries.map((entry) => entry.replace(/^package\//u, "")));
  for (const required of REQUIRED_PACKAGE_FILES) {
    if (!files.has(required)) throw new Error(`Packed plugin is missing ${required}`);
  }
  for (const file of files) {
    if (
      /(^|\/)\.social-metadata(\/|$)/u.test(file) ||
      /^(?:tests|docs|\.github)\//u.test(file) ||
      /(?:^|\/)node_modules\//u.test(file)
    ) {
      throw new Error(`Packed plugin contains prohibited path: ${file}`);
    }
  }
}

async function main() {
  const scratch = await mkdtemp(join(tmpdir(), "social-metadata-package-"));
  try {
    const packed = JSON.parse(execFileSync(
      "npm", ["pack", "--json", "--pack-destination", scratch], { encoding: "utf8" },
    ));
    const filename = packed[0]?.filename;
    if (!filename) throw new Error("npm pack returned no filename");
    const archive = join(scratch, filename);
    const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
      .trim().split("\n").filter((entry) => entry && !entry.endsWith("/"));
    assertPackageEntries(entries);
    execFileSync("tar", ["-xzf", archive, "-C", scratch]);

    const packageRoot = join(scratch, "package");
    const runId = "run_ci_package_smoke";
    const stdout = execFileSync(process.execPath, [
      join(packageRoot, "bin/social-metadata.js"),
      "plan", "--state-root", join(scratch, "state"), "--json", JSON.stringify({
        contractVersion: "1.0",
        runId,
        creativeBrief: { summary: "Synthetic CI package smoke." },
        inputReferences: [],
        channels: ["youtube"],
        locale: { uiLocale: "en-US", region: "US", timezone: "UTC" },
        orchestrationMode: "automatic",
        enabledModules: ["search-term"],
        defaultEvidenceTier: "autocomplete_only",
        browserSelection: { browser: "chrome", confirmedByUser: true },
        completedResearchTabs: "close",
        approvedPrefixes: { youtube: { "search-term": ["package smoke"] } },
        interactionBounds: {
          maxPrefixesPerModule: 1,
          maxSuggestionsPerPrefix: 3,
          maxResultsPerCandidate: 1,
          maxRefinementRounds: 1,
        },
      }),
    ], { cwd: packageRoot, encoding: "utf8" });
    const lines = stdout.trim().split(/\r?\n/u);
    if (lines.length !== 1) throw new Error("Packed CLI emitted multiple stdout lines");
    const envelope = JSON.parse(lines[0]);
    if (!envelope.ok || envelope.runId !== runId ||
        envelope.data?.nextAction?.completedResearchTabs !== "close") {
      throw new Error("Packed CLI plan contract failed");
    }
    process.stdout.write(`${JSON.stringify({ ok: true, package: filename })}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
