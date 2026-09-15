import type { BatchCampaign, BatchLaunchCopy, BatchLaunchInput, BatchMediaFile } from "@/lib/batch-launch-types";

export const copy: BatchLaunchCopy = {
  primaryText: "Our best primary text",
  headline: "A headline",
  description: "Description",
  landingUrl: "https://example.com/product",
  callToAction: "SHOP_NOW",
  pageId: "123",
  instagramId: "456",
  urlTags: "utm_source=meta"
};
export const campaign: BatchCampaign = {
  id: "789",
  name: "Website sales",
  objective: "OUTCOME_SALES",
  status: "ACTIVE",
  dailyBudget: 0,
  lifetimeBudget: 0
};
export const template = {
  id: "987",
  account_id: "111",
  campaign_id: campaign.id,
  optimization_goal: "OFFSITE_CONVERSIONS",
  billing_event: "IMPRESSIONS",
  destination_type: "WEBSITE",
  promoted_object: { pixel_id: "222", custom_event_type: "PURCHASE" },
  targeting: {
    age_min: 25,
    age_max: 65,
    genders: [2],
    geo_locations: { countries: ["IT"], cities: [{ key: "old-city" }] },
    excluded_geo_locations: { countries: ["DE"] },
    locales: [4],
    targeting_automation: { advantage_audience: 0 }
  },
  bid_strategy: "LOWEST_COST_WITHOUT_CAP"
};
export function media(id = "feed", overrides: Partial<BatchMediaFile> = {}): BatchMediaFile {
  return {
    id,
    name: "Motif_1_1x1.png",
    path: "Export_1x1/Motif_1_1x1.png",
    mimeType: "image/png",
    size: 4,
    width: 1080,
    height: 1080,
    kind: "image",
    placement: "feed",
    thumbnailUrl: null,
    modifiedTime: "2026-09-15T12:00:00Z",
    ...overrides
  };
}
export const feed = media();
export const story = media("story", {
  name: "Motif_1_9x16.png",
  path: "Export_9x16/Motif_1_9x16.png",
  height: 1920,
  placement: "story"
});
export const settings = { dailyBudget: "60.50", countries: ["DE", "AT"], locales: [{ id: 5, name: "German" }] };
export const launchInput: BatchLaunchInput = {
  accountId: "account",
  folderId: "folder",
  campaignId: campaign.id,
  templateId: template.id,
  name: "Batch 01",
  settings,
  copy,
  groups: [{ id: "ad-1", name: "Motif 1", feedFileId: feed.id, storyFileId: null }]
};
