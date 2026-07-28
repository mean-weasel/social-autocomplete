import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { makeReceipt } from "./harness.mjs";

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const outputIndex = args.indexOf("--output");
if (inputIndex < 0 || !args[inputIndex + 1]) {
  process.stderr.write("Usage: node scripts/browser-acceptance/run.mjs --input @checklist.json [--output receipt.json]\n");
  process.exit(2);
}
const source = args[inputIndex + 1];
const json = source.startsWith("@") ? await readFile(resolve(source.slice(1)), "utf8") : source;
try {
  const receipt = makeReceipt(JSON.parse(json));
  if (outputIndex >= 0 && args[outputIndex + 1]) {
    const output = resolve(args[outputIndex + 1]);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, receipt })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "Unknown harness error.",
  })}\n`);
  process.exitCode = 2;
}
