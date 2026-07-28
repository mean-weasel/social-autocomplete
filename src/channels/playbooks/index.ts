import type { Channel } from "../../contracts/index.js";
import type { ChannelPlaybook } from "../types.js";
import { facebookPlaybook } from "./facebook.js";
import { instagramPlaybook } from "./instagram.js";
import { linkedinPlaybook } from "./linkedin.js";
import { pinterestPlaybook } from "./pinterest.js";
import { tiktokPlaybook } from "./tiktok.js";
import { xPlaybook } from "./x.js";
import { youtubePlaybook } from "./youtube.js";

export const playbooks: Record<Channel, ChannelPlaybook> = {
  facebook: facebookPlaybook,
  instagram: instagramPlaybook,
  linkedin: linkedinPlaybook,
  x: xPlaybook,
  tiktok: tiktokPlaybook,
  youtube: youtubePlaybook,
  pinterest: pinterestPlaybook,
};
