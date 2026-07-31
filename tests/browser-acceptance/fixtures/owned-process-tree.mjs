import { spawn } from "node:child_process";
import { access, writeFile } from "node:fs/promises";

const ready = process.env.OWNED_PROCESS_READY;

if (process.argv[2] === "descendant") {
  await writeFile(ready, `${process.pid}\n`);
  await new Promise(() => setInterval(() => {}, 1_000));
} else {
  const descendant = spawn(process.execPath, [new URL(import.meta.url).pathname, "descendant"], {
    env: process.env,
    stdio: "ignore",
  });
  descendant.unref();
  for (;;) {
    try {
      await access(ready);
      break;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    }
  }
}
