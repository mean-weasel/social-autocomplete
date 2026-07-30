import { ContractError, CONTRACT_VERSION } from "../contracts/index.js";
import { parseArguments } from "./arguments.js";
import { executeCommand } from "./commands.js";
function writeEnvelope(envelope) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
}
async function main() {
    let command = "unknown";
    try {
        const args = parseArguments(process.argv.slice(2));
        command = args.command;
        const result = await executeCommand(args, process.cwd());
        writeEnvelope(result.envelope);
        process.exitCode = result.exitCode;
    }
    catch (error) {
        const contractError = error instanceof ContractError
            ? error
            : new ContractError("Internal error.", [
                { code: "internal_error", message: error instanceof Error ? error.message : "Unknown error." },
            ]);
        writeEnvelope({
            contractVersion: CONTRACT_VERSION,
            command,
            ok: false,
            ...(contractError.runId ? { runId: contractError.runId } : {}),
            data: null,
            warnings: [],
            errors: contractError.issues,
        });
        process.exitCode = contractError.exitCode;
    }
}
await main();
//# sourceMappingURL=main.js.map