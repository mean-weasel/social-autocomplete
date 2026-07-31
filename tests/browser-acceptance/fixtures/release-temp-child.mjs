import { appendFile, mkdir, writeFile } from "node:fs/promises";

const mode = process.argv[2] ?? "success";
const root = process.env.SOCIAL_METADATA_RELEASE_ROOT;
const record = process.env.RELEASE_TEMP_RECORD;
if (!root || !record) throw new Error("fixture requires release root and record path");

await appendFile(record, `${root}\n`);
if (mode === "error") process.exitCode = 7;
if (mode === "wait") {
  await writeFile(`${record}.ready`, "ready\n");
  await new Promise(() => setInterval(() => {}, 1_000));
}
if (mode === "resistant") {
  // Ignore the initial group signal and attempt to recreate the owned root
  // after the parent's grace window. SIGKILL must prevent both actions.
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => {});
  await writeFile(`${record}.pid`, `${process.pid}\n`);
  await writeFile(`${record}.ready`, "ready\n");
  setTimeout(() => {
    void mkdir(root, { recursive: true }).then(() => writeFile(`${root}/recreated`, "unexpected\n"));
  }, 2_100);
  await new Promise(() => setInterval(() => {}, 1_000));
}
