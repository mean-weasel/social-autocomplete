import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  acquireTempRoot,
  composePrimaryAndClosureFailure,
  createBoundedChildLifecycle,
  removeAcquiredTempRoot,
} from "../browser-acceptance/owned-temp-root.mjs";

const repo = resolve(".");
const tempRoot = await acquireTempRoot({
  prefix: "social-metadata-install-",
  borrowedRoot: process.env.SOCIAL_METADATA_RELEASE_ROOT,
  descendant: "install-smoke",
});
const scratch = tempRoot.path;
const marketplace = join(scratch, "marketplace");
const pluginRoot = join(marketplace, "plugins", "social-metadata-research");
const marketplaceName = `social-metadata-smoke-${process.pid}`;
let marketplaceAdded = false;
let pluginAdded = false;
// Marketplace installation can legitimately outlast the ordinary test commands.
// Keep its own finite epoch deadline below the release watchdog (240 seconds).
const commandTimeoutMs = boundedInteger("INSTALL_SMOKE_COMMAND_TIMEOUT_MS", "180000", 180_000);
const childGraceMs = boundedInteger("INSTALL_SMOKE_CHILD_GRACE_MS", "2000", 10_000);
const lifecycle = createBoundedChildLifecycle({ timeoutMs: commandTimeoutMs, graceMs: childGraceMs });
let terminatingSignal = null;
let cleanupPromise = null;

function boundedInteger(name, fallback, maximum) {
  const milliseconds = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > maximum) {
    throw new Error(`${name} must be a finite integer from 1 to ${maximum}`);
  }
  return milliseconds;
}

async function run(command, args, cwd = repo, env = process.env) {
  const result = await lifecycle.run(command, args, { cwd, env });
  return result.stdout.trim();
}

async function cleanup(signal = null) {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    let failure;
    try {
      await lifecycle.shutdown(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
      const codexEnv = { ...process.env, CODEX_HOME: join(scratch, "codex-home") };
      if (pluginAdded) {
        try { await run("codex", ["plugin", "remove", `social-metadata-research@${marketplaceName}`, "--json"], repo, codexEnv); } catch (error) { failure ??= error; }
      }
      if (marketplaceAdded) {
        try { await run("codex", ["plugin", "marketplace", "remove", marketplaceName, "--json"], repo, codexEnv); } catch (error) { failure ??= error; }
      }
    } finally {
      await removeAcquiredTempRoot(tempRoot, lifecycle.closureToken());
    }
    if (failure) throw failure;
  })();
  return cleanupPromise;
}

async function interrupt(signal) {
  if (terminatingSignal) return;
  terminatingSignal = signal;
  try {
    await cleanup(signal);
    process.exit(signal === "SIGINT" ? 130 : 143);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

process.once("SIGINT", () => { void interrupt("SIGINT"); });
process.once("SIGTERM", () => { void interrupt("SIGTERM"); });

let successOutput;
let primaryFailure;
try {
  const packed = JSON.parse(await run("npm", ["pack", "--json", "--pack-destination", scratch]));
  const filename = packed[0]?.filename;
  if (!filename) throw new Error("npm pack did not return a filename");
  await mkdir(pluginRoot, { recursive: true });
  await run("tar", ["-xzf", join(scratch, filename), "--strip-components=1", "-C", pluginRoot]);

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
  const cliPlan = JSON.parse(await run(process.execPath, [
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

  const isolatedCodexHome = join(scratch, "codex-home");
  await mkdir(isolatedCodexHome, { recursive: true });
  const codexEnv = { ...process.env, CODEX_HOME: isolatedCodexHome };
  JSON.parse(await run("codex", ["plugin", "marketplace", "add", marketplace, "--json"], repo, codexEnv));
  marketplaceAdded = true;
  JSON.parse(await run("codex", ["plugin", "add", `social-metadata-research@${marketplaceName}`, "--json"], repo, codexEnv));
  pluginAdded = true;
  const freshCatalog = JSON.parse(await run("codex", ["plugin", "list", "--marketplace", marketplaceName, "--json"], repo, codexEnv));
  const installed = freshCatalog.installed?.filter(
    (entry) => entry.pluginId === `social-metadata-research@${marketplaceName}` && entry.enabled,
  );
  if (installed?.length !== 1) {
    throw new Error("Fresh Codex process did not report the installed orchestrator plugin");
  }

  await run("claude", ["plugin", "validate", "--strict", pluginRoot]);
  await run("claude", ["--plugin-dir", pluginRoot, "--version"]);

  successOutput = `${JSON.stringify({
    ok: true,
    package: filename,
    codexMarketplaceInstall: "pass",
    codexCatalog: {
      topLevelSkills: ["social-metadata-research"],
      linkedChannelResources: linkedPlaybooks.length,
    },
    cliSubprocess: "pass",
    claudePluginDirLoad: "pass",
  })}\n`;
} catch (error) {
  primaryFailure = error;
}

try {
  await cleanup();
} catch (closureError) {
  if (primaryFailure) throw composePrimaryAndClosureFailure(primaryFailure, closureError);
  throw closureError;
}

if (primaryFailure) throw primaryFailure;

process.stdout.write(successOutput);
