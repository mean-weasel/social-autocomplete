import { runFixtureReplay } from "../modules/fixture-replay.js";
import { runChannelFixtureReplay } from "./fixture-replay.js";

const scopeIndex = process.argv.indexOf("--scope");
const scope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : undefined;
if (scope === "modules") {
  process.stdout.write(`${JSON.stringify({ ok: true, scope, ...(await runFixtureReplay()) })}\n`);
} else if (scope === "channels") {
  process.stdout.write(`${JSON.stringify({ ok: true, scope, ...(await runChannelFixtureReplay()) })}\n`);
} else {
  process.stderr.write("Usage: npm run test:fixture-replay -- --scope modules|channels\n");
  process.exitCode = 2;
}
