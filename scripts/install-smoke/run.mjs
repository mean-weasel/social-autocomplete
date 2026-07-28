import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
    "dist/src/cli/main.js",
  ]) {
    await readFile(join(pluginRoot, required), "utf8");
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

  run("claude", ["plugin", "validate", "--strict", pluginRoot]);
  run("claude", ["--plugin-dir", pluginRoot, "--version"]);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    package: filename,
    codexMarketplaceInstall: "pass",
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
