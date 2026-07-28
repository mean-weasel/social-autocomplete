import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { summarizeLiveReceipts } from "./coverage.mjs";

const allowMissing = process.argv.includes("--allow-missing-live-receipts");
const commands = [
  ["npm", ["run", "verify:offline"]],
  ["npm", ["run", "test:diagnostics"]],
  ["npm", ["run", "test:browser-harness"]],
  ["npm", ["run", "test:install"]],
  ["claude", ["plugin", "validate", "--strict", "."]],
  ["npm", ["run", "example:subprocess"]],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: resolve("."), encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const receiptDir = resolve("docs/browser-acceptance/receipts");
let receiptFiles = [];
try {
  receiptFiles = (await readdir(receiptDir)).filter((name) => name.endsWith(".json"));
} catch {
  receiptFiles = [];
}
const receipts = [];
for (const file of receiptFiles) {
  const receipt = JSON.parse(await readFile(resolve(receiptDir, file), "utf8"));
  if (receipt.contractVersion !== "1.0" || receipt.receiptVersion !== "1.0") {
    throw new Error(`Invalid acceptance receipt version: ${file}`);
  }
  receipts.push(receipt);
}
const coverage = summarizeLiveReceipts(receipts);
if (!coverage.requirementsMet && !allowMissing) {
  process.stderr.write(
    `Fresh live coverage is incomplete: channels=${coverage.missingChannels.join(",") || "none"}; passing modules=${coverage.missingPassingModules.join(",") || "none"}; public=${coverage.publicPass}; authenticated=${coverage.authenticatedPass}.\n`,
  );
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({
  ok: true,
  offline: "pass",
  cleanInstall: "pass",
  subprocess: "pass",
  liveReceipts: { required: !allowMissing, ...coverage },
})}\n`);
