import { readFile } from "node:fs/promises";
import { ContractError } from "../contracts/index.js";

export interface ParsedArguments {
  command: "plan" | "record-observation" | "validate" | "unknown";
  runId?: string;
  channelRunId?: string;
  json?: string;
  stateRoot?: string;
}

export function parseArguments(argv: string[]): ParsedArguments {
  const commandValue = argv[0] ?? "unknown";
  const command =
    commandValue === "plan" || commandValue === "record-observation" || commandValue === "validate"
      ? commandValue
      : "unknown";
  const parsed: ParsedArguments = { command };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (
      (
        token === "--run" ||
        token === "--channel-run" ||
        token === "--json" ||
        token === "--state-root"
      ) &&
      value !== undefined
    ) {
      if (token === "--run") parsed.runId = value;
      if (token === "--channel-run") parsed.channelRunId = value;
      if (token === "--json") parsed.json = value;
      if (token === "--state-root") parsed.stateRoot = value;
      index += 1;
      continue;
    }
    throw new ContractError("Invalid command arguments.", [
      { code: "invalid_argument", message: `Unexpected or incomplete argument: ${token ?? ""}` },
    ]);
  }
  return parsed;
}

export async function readJsonInput(input: string): Promise<unknown> {
  const content = input.startsWith("@") ? await readFile(input.slice(1), "utf8") : input;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new ContractError("Invalid JSON.", [
      { code: "invalid_json", message: "The --json value is not valid JSON." },
    ]);
  }
}
