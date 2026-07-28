const channels = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube", "pinterest"];
const modules = ["search-term", "hashtag"];

export function summarizeLiveReceipts(receipts, now = Date.now()) {
  const fresh = receipts.filter((receipt) => {
    const age = now - Date.parse(receipt.capturedAt);
    return age >= 0 && age <= 24 * 60 * 60 * 1000;
  });
  for (const receipt of fresh) {
    if (receipt.status === "pass" && (!receipt.interaction?.attempted || !receipt.interaction?.succeeded)) {
      throw new Error(`Passing receipt lacks a successful bounded interaction: ${receipt.receiptId}`);
    }
  }
  const passing = fresh.filter((receipt) => receipt.status === "pass");
  const representedChannels = new Set(fresh.map((receipt) => receipt.channel));
  const passingModules = new Set(passing.map((receipt) => receipt.module));
  const missingChannels = channels.filter((channel) => !representedChannels.has(channel));
  const missingPassingModules = modules.filter((module) => !passingModules.has(module));
  const publicPass = passing.some((receipt) => receipt.accessClass === "public");
  const authenticatedPass = passing.some((receipt) => receipt.accessClass === "authenticated");
  const interrupted = fresh.filter((receipt) => receipt.status === "interrupted").map((receipt) => receipt.receiptId);
  const failed = fresh.filter((receipt) => receipt.status === "failed").map((receipt) => receipt.receiptId);
  const notApplicable = fresh.filter((receipt) => receipt.status === "not_applicable").map((receipt) => receipt.receiptId);
  return {
    total: receipts.length,
    fresh: fresh.length,
    passing: passing.length,
    representedChannels: [...representedChannels].sort(),
    passingModules: [...passingModules].sort(),
    missingChannels,
    missingPassingModules,
    publicPass,
    authenticatedPass,
    interrupted,
    failed,
    notApplicable,
    requirementsMet:
      missingChannels.length === 0 &&
      missingPassingModules.length === 0 &&
      publicPass &&
      authenticatedPass,
  };
}
