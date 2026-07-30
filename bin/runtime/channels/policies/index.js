const searchTermRange = { min: 3, max: 5 };
const hashtagRanges = {
    facebook: { min: 1, max: 3 },
    instagram: { min: 3, max: 5 },
    linkedin: { min: 1, max: 3 },
    x: { min: 1, max: 2 },
    tiktok: { min: 3, max: 5 },
    youtube: { min: 1, max: 3 },
    pinterest: null,
};
export function getChannelModulePolicy(channel, moduleName) {
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
export function canCompleteWithPublicBrowser(channel) {
    return channel === "tiktok" || channel === "youtube" || channel === "pinterest";
}
export function defaultAccessMode(channel) {
    return channel === "facebook" || channel === "instagram" || channel === "linkedin" || channel === "x"
        ? "authenticated"
        : "authenticated_preferred";
}
export function evidenceTierIsConsumable(tier) {
    return tier === "autocomplete_only" || tier === "results_sample";
}
//# sourceMappingURL=index.js.map