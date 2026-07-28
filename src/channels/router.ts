import type { Channel } from "../contracts/index.js";
import { playbooks } from "./playbooks/index.js";
import type {
  ChannelPlaybook,
  RouteDecision,
  RouteRequest,
} from "./types.js";

export function getPlaybook(channel: Channel): ChannelPlaybook {
  return playbooks[channel]!;
}

export function routeChannel(request: RouteRequest): RouteDecision {
  const playbook = getPlaybook(request.channel);
  const procedure = playbook.modules[request.module];
  const base = {
    contractVersion: "1.0" as const,
    channel: request.channel,
    module: request.module,
    playbookVersion: playbook.playbookVersion,
    playbook,
  };
  if (procedure.support === "not_applicable") {
    return {
      ...base,
      status: "not_applicable",
      reasonCode: "module_not_applicable",
      instruction: procedure.zeroPolicy,
    };
  }
  if (!playbook.supportedBrowsers[request.host].includes(request.browser)) {
    return {
      ...base,
      status: "failed",
      reasonCode: "browser_not_supported",
      instruction: `Use one of: ${playbook.supportedBrowsers[request.host].join(", ")}.`,
    };
  }
  if (request.accessMode === "public" && !playbook.publicCompletion) {
    return {
      ...base,
      status: "interrupted",
      reasonCode: "authentication_required",
      instruction: playbook.interruptions.authentication,
    };
  }
  return { ...base, status: "ready", instruction: playbook.entryInstruction };
}
