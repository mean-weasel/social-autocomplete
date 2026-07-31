import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parseDocument } from "yaml";

const tracked = execFileSync(
  "git",
  ["ls-files", "--", "*.json", "*.yaml", "*.yml", "*.md"],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);

function parseYaml(text, file) {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) {
    throw new Error(`${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  return document.toJS();
}

for (const file of tracked.filter((item) => item.endsWith(".json"))) {
  JSON.parse(await readFile(file, "utf8"));
}
for (const file of tracked.filter((item) => /\.ya?ml$/u.test(item))) {
  parseYaml(await readFile(file, "utf8"), file);
}

const schemaFiles = tracked.filter((item) =>
  item.startsWith("schemas/") && item.endsWith(".schema.json"));
for (const file of schemaFiles) {
  const schema = JSON.parse(await readFile(file, "utf8"));
  new Ajv2020({
    allErrors: true,
    strict: true,
    formats: { date: true, "date-time": true, uri: true },
  }).compile(schema);
}

const skillFiles = tracked.filter((item) =>
  item.startsWith("skills/") && item.endsWith("/SKILL.md"));
if (skillFiles.length !== 8) throw new Error(`Expected 8 skills; found ${skillFiles.length}`);
for (const file of skillFiles) {
  const text = await readFile(file, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) throw new Error(`${file}: missing YAML frontmatter`);
  const metadata = parseYaml(match[1], file);
  if (!metadata?.name || !metadata?.description) {
    throw new Error(`${file}: frontmatter requires name and description`);
  }
  if (/(?:^|[\s("'`])\/Users\//mu.test(text)) {
    throw new Error(`${file}: machine-local path is prohibited`);
  }
}

const orchestratorPath = "skills/social-metadata-research/SKILL.md";
const orchestrator = await readFile(orchestratorPath, "utf8");
const linkedPlaybooks = [...orchestrator.matchAll(
  /\]\(\.\.\/([a-z-]+-metadata-research)\/SKILL\.md\)/gu,
)].map((match) => match[1]);
if (linkedPlaybooks.length !== 7 || new Set(linkedPlaybooks).size !== 7) {
  throw new Error("The orchestrator must link exactly 7 unique channel playbooks");
}
for (const playbook of linkedPlaybooks) {
  await access(resolve(dirname(orchestratorPath), "..", playbook, "SKILL.md"));
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  json: tracked.filter((item) => item.endsWith(".json")).length,
  yaml: tracked.filter((item) => /\.ya?ml$/u.test(item)).length,
  schemas: schemaFiles.length,
  skills: skillFiles.length,
})}\n`);
