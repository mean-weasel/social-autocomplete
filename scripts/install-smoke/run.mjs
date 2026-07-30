import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(".");
const scratch = await mkdtemp(join(tmpdir(), "social-metadata-install-"));
const marketplace = join(scratch, "marketplace");
const pluginRoot = join(marketplace, "plugins", "social-metadata-research");
const marketplaceName = `social-metadata-smoke-${process.pid}`;
let marketplaceAdded = false;
let pluginAdded = false;

function run(command, args, cwd = repo) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", scratch]));
  const filename = packed[0]?.filename;
  if (!filename) throw new Error("npm pack did not return a filename");
  await mkdir(pluginRoot, { recursive: true });
  run("tar", ["-xzf", join(scratch, filename), "--strip-components=1", "-C", pluginRoot]);

  for (const required of [
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "skills/social-metadata-research/SKILL.md",
    "bin/social-metadata.js",
    "bin/runtime/cli/main.js",
  ]) {
    await readFile(join(pluginRoot, required), "utf8");
  }

  const cliStateRoot = join(scratch, "cli-state");
  const cliRunId = `run_install_smoke_${process.pid}`;
  const cliPlan = JSON.parse(run(process.execPath, [
    join(pluginRoot, "bin/social-metadata.js"),
    "plan",
    "--state-root",
    cliStateRoot,
    "--json",
    JSON.stringify({
      contractVersion: "1.0",
      runId: cliRunId,
      creativeBrief: { summary: "A synthetic install-smoke creative brief." },
      inputReferences: [],
      channels: ["youtube"],
      locale: { uiLocale: "en-US", region: "US", timezone: "America/Phoenix" },
      orchestrationMode: "automatic",
      enabledModules: ["search-term"],
      defaultEvidenceTier: "autocomplete_only",
      browserSelection: { browser: "chrome", confirmedByUser: true },
      approvedPrefixes: { youtube: { "search-term": ["install smoke"] } },
      interactionBounds: {
        maxPrefixesPerModule: 3,
        maxSuggestionsPerPrefix: 10,
        maxResultsPerCandidate: 3,
        maxRefinementRounds: 1,
      },
    }),
  ], pluginRoot));
  if (!cliPlan.ok || cliPlan.runId !== cliRunId) {
    throw new Error("Packed plugin CLI did not create a plan through stdout JSON");
  }

  const codexManifest = JSON.parse(await readFile(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
  if (codexManifest.skills !== "./skills/social-metadata-research/") {
    throw new Error(`Unexpected Codex skills root: ${codexManifest.skills}`);
  }
  const topLevelSkillFiles = (await readdir(join(pluginRoot, "skills", "social-metadata-research")))
    .filter((name) => name === "SKILL.md");
  if (topLevelSkillFiles.length !== 1) {
    throw new Error(`Expected one orchestrator SKILL.md, found ${topLevelSkillFiles.length}`);
  }
  const orchestrator = await readFile(join(pluginRoot, "skills/social-metadata-research/SKILL.md"), "utf8");
  const linkedPlaybooks = [...orchestrator.matchAll(/\]\(\.\.\/([a-z-]+-metadata-research)\/SKILL\.md\)/g)]
    .map((match) => match[1]);
  if (linkedPlaybooks.length !== 7 || new Set(linkedPlaybooks).size !== 7) {
    throw new Error(`Expected seven unique linked channel playbooks, found ${linkedPlaybooks.length}`);
  }
  for (const playbook of linkedPlaybooks) {
    await readFile(join(pluginRoot, "skills", playbook, "SKILL.md"), "utf8");
  }

  await mkdir(join(marketplace, ".agents", "plugins"), { recursive: true });
  await writeFile(
    join(marketplace, ".agents", "plugins", "marketplace.json"),
    `${JSON.stringify({
      name: marketplaceName,
      interface: { displayName: "Social Metadata install smoke" },
      plugins: [{
        name: "social-metadata-research",
        source: "./plugins/social-metadata-research",
        description: "Temporary clean-install smoke package.",
      }],
    }, null, 2)}\n`,
  );

  JSON.parse(run("codex", ["plugin", "marketplace", "add", marketplace, "--json"]));
  marketplaceAdded = true;
  JSON.parse(run("codex", ["plugin", "add", `social-metadata-research@${marketplaceName}`, "--json"]));
  pluginAdded = true;
  const freshCatalog = JSON.parse(run("codex", ["plugin", "list", "--marketplace", marketplaceName, "--json"]));
  const installed = freshCatalog.installed?.filter(
    (entry) => entry.pluginId === `social-metadata-research@${marketplaceName}` && entry.enabled,
  );
  if (installed?.length !== 1) {
    throw new Error("Fresh Codex process did not report the installed orchestrator plugin");
  }

  run("claude", ["plugin", "validate", "--strict", pluginRoot]);
  run("claude", ["--plugin-dir", pluginRoot, "--version"]);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    package: filename,
    codexMarketplaceInstall: "pass",
    codexCatalog: {
      topLevelSkills: ["social-metadata-research"],
      linkedChannelResources: linkedPlaybooks.length,
    },
    cliSubprocess: "pass",
    claudePluginDirLoad: "pass",
  })}\n`);
} finally {
  if (pluginAdded) {
    spawnSync("codex", ["plugin", "remove", `social-metadata-research@${marketplaceName}`, "--json"], {
      cwd: repo,
      encoding: "utf8",
    });
  }
  if (marketplaceAdded) {
    spawnSync("codex", ["plugin", "marketplace", "remove", marketplaceName, "--json"], {
      cwd: repo,
      encoding: "utf8",
    });
  }
  await rm(scratch, { recursive: true, force: true });
}
