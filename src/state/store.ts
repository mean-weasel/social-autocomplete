import { createHash, randomUUID } from "node:crypto";
import { access, appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  ContractError,
  type Observation,
  type PlanAmendment,
  type StoredPlan,
} from "../contracts/index.js";

export interface RunStatus {
  contractVersion: "1.0";
  runId: string;
  state: "planned" | "observing" | "validated" | "interrupted";
  updatedAt: string;
  latestReceipt?: string;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findGitMetadata(
  start: string,
): Promise<{ root: string; gitDir: string; commonDir: string } | undefined> {
  let cursor = resolve(start);
  while (true) {
    const dotGit = join(cursor, ".git");
    if (await exists(dotGit)) {
      let gitDir = dotGit;
      try {
        const pointer = await readFile(dotGit, "utf8");
        const match = /^gitdir:\s*(.+)\s*$/u.exec(pointer);
        if (match?.[1]) gitDir = resolve(cursor, match[1]);
      } catch {
        // A normal repository uses a .git directory, which is not readable as a file.
      }
      let commonDir = gitDir;
      const commonPointer = join(gitDir, "commondir");
      if (await exists(commonPointer)) {
        commonDir = resolve(gitDir, (await readFile(commonPointer, "utf8")).trim());
      }
      return { root: cursor, gitDir, commonDir };
    }
    const parent = dirname(cursor);
    if (parent === cursor) return undefined;
    cursor = parent;
  }
}

async function ensureLocalExclude(cwd: string, stateRoot: string): Promise<void> {
  const metadata = await findGitMetadata(cwd);
  if (!metadata || resolve(stateRoot) !== resolve(metadata.root, ".social-metadata")) return;
  const excludePath = join(metadata.commonDir, "info", "exclude");
  await mkdir(dirname(excludePath), { recursive: true });
  const current = (await exists(excludePath)) ? await readFile(excludePath, "utf8") : "";
  const entry = ".social-metadata/";
  if (!current.split(/\r?\n/u).includes(entry)) {
    await appendFile(excludePath, `${current.endsWith("\n") || current === "" ? "" : "\n"}${entry}\n`, "utf8");
  }
}

export class StateStore {
  readonly root: string;
  readonly cwd: string;

  constructor(cwd: string, rootOverride?: string) {
    this.cwd = resolve(cwd);
    this.root = resolve(cwd, rootOverride ?? ".social-metadata");
  }

  private runDir(runId: string): string {
    if (!/^run_[A-Za-z0-9_-]+$/.test(runId)) {
      throw new ContractError("Invalid run id.", [
        { code: "invalid_run_id", message: "Expected run_<id>.", path: "--run" },
      ], 2, runId);
    }
    return join(this.root, "runs", runId);
  }

  async initialize(): Promise<void> {
    await mkdir(join(this.root, "runs"), { recursive: true });
    await ensureLocalExclude(this.cwd, this.root);
  }

  async createPlan(plan: StoredPlan): Promise<void> {
    await this.initialize();
    const runDir = this.runDir(plan.runId);
    if (await exists(join(runDir, "plan.json"))) {
      throw new ContractError("Run already exists.", [
        { code: "run_exists", message: `Run ${plan.runId} already exists.` },
      ], 2, plan.runId);
    }
    await mkdir(join(runDir, "receipts"), { recursive: true });
    await mkdir(join(runDir, "diagnostics"), { recursive: true });
    await writeFile(join(runDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    await writeFile(join(runDir, "plan-amendments.jsonl"), "", "utf8");
    await writeFile(join(runDir, "observations.jsonl"), "", "utf8");
    await this.writeStatus({
      contractVersion: "1.0",
      runId: plan.runId,
      state: "planned",
      updatedAt: plan.createdAt,
    });
  }

  async readPlan(runId: string): Promise<StoredPlan> {
    try {
      return JSON.parse(await readFile(join(this.runDir(runId), "plan.json"), "utf8")) as StoredPlan;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ContractError("Run not found.", [
          { code: "run_not_found", message: `Run ${runId} does not exist.` },
        ], 2, runId);
      }
      throw error;
    }
  }

  private async readJsonLines<T>(path: string): Promise<T[]> {
    const content = await readFile(path, "utf8");
    return content
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as T);
  }

  async readAmendments(runId: string): Promise<PlanAmendment[]> {
    await this.readPlan(runId);
    return this.readJsonLines(join(this.runDir(runId), "plan-amendments.jsonl"));
  }

  async appendAmendment(amendment: PlanAmendment): Promise<"recorded" | "duplicate"> {
    const amendments = await this.readAmendments(amendment.runId);
    const existing = amendments.find((item) => item.amendmentId === amendment.amendmentId);
    if (existing) {
      const { createdAt: _existingCreatedAt, ...existingContent } = existing;
      const { createdAt: _newCreatedAt, ...newContent } = amendment;
      if (stableJson(existingContent) === stableJson(newContent)) return "duplicate";
      throw new ContractError("Amendment id conflict.", [
        { code: "amendment_id_conflict", message: "The amendmentId already exists with different content." },
      ], 2, amendment.runId);
    }
    await appendFile(join(this.runDir(amendment.runId), "plan-amendments.jsonl"), `${JSON.stringify(amendment)}\n`, "utf8");
    return "recorded";
  }

  async readObservations(runId: string): Promise<Observation[]> {
    await this.readPlan(runId);
    return this.readJsonLines(join(this.runDir(runId), "observations.jsonl"));
  }

  async appendObservation(observation: Observation): Promise<"recorded" | "duplicate"> {
    const plan = await this.readPlan(observation.runId);
    const channelRun = plan.channelRuns.find((item) => item.channelRunId === observation.channelRunId);
    if (!channelRun) {
      throw new ContractError("Unknown channel run.", [
        { code: "unknown_channel_run", message: "channelRunId is not present in the immutable plan." },
      ], 2, observation.runId);
    }
    if (channelRun.channel !== observation.source.channel) {
      throw new ContractError("Channel mismatch.", [
        { code: "channel_mismatch", message: "Observation source channel does not match channelRunId." },
      ], 2, observation.runId);
    }
    const observations = await this.readObservations(observation.runId);
    const existing = observations.find((item) => item.observationId === observation.observationId);
    if (existing) {
      if (stableJson(existing) === stableJson(observation)) return "duplicate";
      throw new ContractError("Observation id conflict.", [
        { code: "observation_id_conflict", message: "The observationId already exists with different content." },
      ], 2, observation.runId);
    }
    await appendFile(join(this.runDir(observation.runId), "observations.jsonl"), `${JSON.stringify(observation)}\n`, "utf8");
    await this.writeStatus({
      contractVersion: "1.0",
      runId: observation.runId,
      state: observation.kind === "interruption" ? "interrupted" : "observing",
      updatedAt: new Date().toISOString(),
    });
    return "recorded";
  }

  async readStatus(runId: string): Promise<RunStatus> {
    await this.readPlan(runId);
    return JSON.parse(await readFile(join(this.runDir(runId), "status.json"), "utf8")) as RunStatus;
  }

  async writeStatus(status: RunStatus): Promise<void> {
    await writeFile(join(this.runDir(status.runId), "status.json"), `${JSON.stringify(status, null, 2)}\n`, "utf8");
  }

  async writeReceipt(runId: string, channelRunId: string, receipt: unknown): Promise<string> {
    const receiptPath = join(this.runDir(runId), "receipts", `${channelRunId}.json`);
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return receiptPath;
  }

  async listReceiptChannelRunIds(runId: string): Promise<string[]> {
    await this.readPlan(runId);
    const receiptDir = join(this.runDir(runId), "receipts");
    return (await readdir(receiptDir))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length));
  }
}
