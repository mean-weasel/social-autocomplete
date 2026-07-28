import type { Channel, EvidenceTier, ModuleName } from "../../contracts/index.js";

export interface RecommendationRange {
  min: number;
  max: number;
}

export interface ChannelModulePolicy {
  supported: boolean;
  recommendationRange: RecommendationRange | null;
  notApplicableReason?: string;
}

const searchTermRange = { min: 3, max: 5 } as const;

const hashtagRanges: Record<Channel, RecommendationRange | null> = {
  facebook: { min: 1, max: 3 },
  instagram: { min: 3, max: 5 },
  linkedin: { min: 1, max: 3 },
  x: { min: 1, max: 2 },
  tiktok: { min: 3, max: 5 },
  youtube: { min: 1, max: 3 },
  pinterest: null,
};

export function getChannelModulePolicy(
  channel: Channel,
  moduleName: ModuleName,
): ChannelModulePolicy {
  if (moduleName === "search-term") {
    return { supported: true, recommendationRange: { ...searchTermRange } };
  }
  const range = hashtagRanges[channel];
  if (!range) {
    return {
      supported: false,
      recommendationRange: null,
      notApplicableReason: "hashtags_not_supported_on_pinterest",
    };
  }
  return { supported: true, recommendationRange: { ...range } };
}

export function canCompleteWithPublicBrowser(channel: Channel): boolean {
  return channel === "tiktok" || channel === "youtube" || channel === "pinterest";
}

export function defaultAccessMode(channel: Channel): "authenticated" | "authenticated_preferred" {
  return channel === "facebook" || channel === "instagram" || channel === "linkedin" || channel === "x"
    ? "authenticated"
    : "authenticated_preferred";
}

export function evidenceTierIsConsumable(tier: EvidenceTier): boolean {
  return tier === "autocomplete_only" || tier === "results_sample";
}
