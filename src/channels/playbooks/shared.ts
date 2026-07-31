import type {
  ChannelPlaybook,
  ModuleProcedure,
  PlaybookStep,
} from "../types.js";
import type { Channel } from "../../contracts/index.js";
import { getChannelModulePolicy } from "../policies/index.js";

export const canonicalSteps: PlaybookStep[] = [
  {
    id: "create-dedicated-target",
    instruction: "After the acknowledged action start, create one new plugin-owned agent tab and navigate it only to this playbook's typed official root.",
    emits: null,
    bound: "exactly one task-scoped target lease for the channel",
  },
  {
    id: "verify-surface",
    instruction: "Verify the channel, access state, confirmed locale, and required semantic search landmarks.",
    emits: "session_state",
    bound: "one visible readiness check",
  },
  {
    id: "enter-prefix",
    instruction: "Enter exactly one current plan prefix without submitting a composer or publishing action.",
    emits: null,
    bound: "at most the plan-defined prefixes",
  },
  {
    id: "capture-suggestions",
    instruction: "Capture only visible native suggestions and their displayed order, type labels, and auxiliary text.",
    emits: "suggestion_set",
    bound: "at most ten visible suggestions per prefix",
  },
  {
    id: "record-decisions",
    instruction: "Record host-selected and rejected candidates with contextual rationales and exact evidence references.",
    emits: "recommendation_decision",
    bound: "no more than the channel recommendation maximum",
  },
  {
    id: "sample-results",
    instruction: "When configured, search every intended recommendation and inspect only visible, distinct results.",
    emits: "result_sample",
    bound: "at most three results per intended recommendation",
  },
  {
    id: "release-dedicated-target",
    instruction: "Release browser-session control of the plugin-owned target after all browser-dependent research and before validating the channel. Close it by default; when the plan says keep_open, finalize the exact tab as a visible deliverable without later rediscovery or reuse. Retain control only for an explicit same-task manual-authentication handoff.",
    emits: null,
    bound: "one release after browser research and before a normal channel result",
  },
  {
    id: "validate",
    instruction: "Validate the channel receipt before advancing to the next channel.",
    emits: null,
    bound: "one channel receipt",
  },
];

const officialRoots: Record<Channel, ChannelPlaybook["dedicatedTarget"]["officialRoot"]> = {
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  linkedin: "https://www.linkedin.com/",
  x: "https://x.com/",
  tiktok: "https://www.tiktok.com/",
  youtube: "https://www.youtube.com/",
  pinterest: "https://www.pinterest.com/",
};

export function dedicatedTargetPolicy(channel: Channel): ChannelPlaybook["dedicatedTarget"] {
  return {
    officialRoot: officialRoots[channel]!,
    ownership: "plugin_owned",
    scope: "task_channel",
    acquisition: "new_agent_tab",
    userTabPolicy: "never_list_claim_inspect_or_reuse",
    rawHandlePolicy: "host_runtime_only",
    taskBoundary: "recreate_from_official_root",
    authenticationHandoff: "retain_same_task_handle",
    completion: "release_required",
  };
}

export function moduleProcedure(
  channel: Parameters<typeof getChannelModulePolicy>[0],
  moduleName: Parameters<typeof getChannelModulePolicy>[1],
  options: Omit<ModuleProcedure, "module" | "support" | "recommendationRange">,
): ModuleProcedure {
  const policy = getChannelModulePolicy(channel, moduleName);
  return {
    module: moduleName,
    support: policy.supported ? "supported" : "not_applicable",
    recommendationRange: policy.recommendationRange,
    ...options,
  };
}

export function sharedPlaybookFields(): Pick<
  ChannelPlaybook,
  "contractVersion" | "playbookVersion" | "evidenceDate" | "prohibitedActions" |
  "steps" | "interruptions" | "resultSample"
> {
  return {
    contractVersion: "1.0",
    playbookVersion: "1.0",
    evidenceDate: "2026-07-27",
    prohibitedActions: [
      "publishing",
      "composer interaction",
      "scraping or crawling",
      "private endpoint access",
      "hidden DOM enumeration",
      "unbounded scrolling or pagination",
      "authentication or challenge bypass",
    ],
    steps: canonicalSteps,
    interruptions: {
      authentication: "Record authentication_required, ask the user to sign in, and resume the same channel run.",
      challenge: "Record the visible challenge and pause without attempting a bypass.",
      localeMismatch: "Record the mismatch and pause until the confirmed run locale is restored or amended.",
      uiChange: "Record expected and observed semantic landmarks plus browser details; never convert a selector miss into zero.",
      assistedResume: "After a UI change, record a diagnostic with resolution=assisted_resume and checkpointsRestored=true before continuing.",
    },
    resultSample: {
      maxResultsPerCandidate: 3,
      visibleFields: [],
      skipSponsored: true,
      engagementIsDescriptiveOnly: true,
    },
  };
}
