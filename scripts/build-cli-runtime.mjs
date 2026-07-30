import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const sourceRoot = resolve("dist/src");
const runtimeRoot = resolve("bin/runtime");

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await javascriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

await rm(runtimeRoot, { recursive: true, force: true });
for (const sourcePath of await javascriptFiles(sourceRoot)) {
  const destination = join(runtimeRoot, relative(sourceRoot, sourcePath));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, await readFile(sourcePath));
}
