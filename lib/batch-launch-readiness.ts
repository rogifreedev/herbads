import { normalizeBatchCopy } from "@/lib/batch-launch-copy";
import { budgetMinorUnits } from "@/lib/batch-launch-plan";
import type { BatchLaunchCopy, BatchLaunchIdentities } from "@/lib/batch-launch-types";

export const batchLaunchBlockerTargets = {
  meta: "launch-account",
  mediaLoading: "launch-media",
  mediaError: "launch-media",
  optionsLoading: "launch-options",
  optionsError: "launch-options",
  copyLoading: "launch-copy",
  copyError: "launch-copy",
  campaign: "launch-campaign",
  template: "launch-template",
  media: "launch-media",
  matching: "launch-matching-review",
  countries: "country-search",
  primaryText: "launch-text",
  headline: "launch-headline",
  page: "launch-pageId",
  instagram: "launch-instagramId",
  identitiesLoading: "launch-identities",
  identitiesError: "launch-identities",
  landingUrl: "launch-landingUrl",
  budget: "launch-budget"
} as const;

type Readiness = {
  metaConfigured: boolean;
  mediaReady: boolean;
  mediaError?: string;
  optionsLoading: boolean;
  optionsError?: string;
  copyLoading: boolean;
  copyError?: string;
  hasActiveCampaign: boolean;
  hasTemplate: boolean;
  adCount: number;
  unreviewedMatching: boolean;
  countries: readonly string[];
  copy: BatchLaunchCopy;
  campaignBudget: boolean;
  dailyBudget: string;
  currency: string;
  identities?: BatchLaunchIdentities;
  identitiesLoading?: boolean;
  identitiesError?: string;
};

// The displayed reasons and both submit buttons must use the same readiness checks.
export function getBatchLaunchBlockers(value: Readiness) {
  const reasons: (keyof typeof batchLaunchBlockerTargets)[] = [];
  if (!value.metaConfigured) reasons.push("meta");
  if (value.identitiesLoading) reasons.push("identitiesLoading");
  else if (value.identitiesError) reasons.push("identitiesError");
  if (!value.mediaReady) reasons.push(value.mediaError ? "mediaError" : "mediaLoading");
  if (value.optionsLoading) reasons.push("optionsLoading");
  else if (value.optionsError) reasons.push("optionsError");
  if (value.copyLoading) reasons.push("copyLoading");
  else if (value.copyError) reasons.push("copyError");
  if (!value.hasActiveCampaign) reasons.push("campaign");
  if (!value.hasTemplate) reasons.push("template");
  if (value.mediaReady && !value.adCount) reasons.push("media");
  if (value.unreviewedMatching) reasons.push("matching");
  if (!value.countries.length) reasons.push("countries");
  const copy = normalizeBatchCopy(value.copy);
  if (!copy.primaryText) reasons.push("primaryText");
  if (!copy.headline) reasons.push("headline");
  if (
    !/^\d+$/.test(copy.pageId) ||
    (value.identities && !value.identities.pages.some((item) => item.id === copy.pageId))
  )
    reasons.push("page");
  if (
    copy.instagramId &&
    value.identities &&
    !value.identities.instagramAccounts.some((item) => item.id === copy.instagramId)
  )
    reasons.push("instagram");
  try {
    const url = new URL(copy.landingUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) reasons.push("landingUrl");
  } catch {
    reasons.push("landingUrl");
  }
  if (!value.campaignBudget) {
    try {
      budgetMinorUnits(value.dailyBudget, value.currency);
    } catch {
      reasons.push("budget");
    }
  }
  return reasons;
}
