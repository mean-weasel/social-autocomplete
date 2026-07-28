import { runFixtureReplay } from "./fixture-replay.js";

const scopeIndex = process.argv.indexOf("--scope");
const scope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : "modules";
if (scope !== "modules") {
  process.stderr.write(`Unsupported fixture scope: ${scope ?? ""}\n`);
  process.exitCode = 2;
} else {
  const result = await runFixtureReplay();
  process.stdout.write(`${JSON.stringify({ ok: true, scope, ...result })}\n`);
}
