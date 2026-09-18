import { describe, expect, it } from "vitest";
import { batchLaunchBlockerTargets, getBatchLaunchBlockers } from "@/lib/batch-launch-readiness";

const ready = {
  metaConfigured: true,
  mediaReady: true,
  optionsLoading: false,
  copyLoading: false,
  hasActiveCampaign: true,
  hasTemplate: true,
  adCount: 3,
  unreviewedMatching: false,
  countries: ["IT"],
  copy: {
    primaryText: "Testo principale",
    headline: "Titolo",
    description: "",
    pageId: "1325488887310068",
    landingUrl: "https://example.com/product",
    callToAction: "SHOP_NOW",
    instagramId: "",
    urlTags: ""
  },
  campaignBudget: false,
  dailyBudget: "20.00",
  currency: "EUR"
};

describe("batch launch readiness", () => {
  it("allows a complete batch without requiring all five variants or a description", () => {
    expect(getBatchLaunchBlockers(ready)).toEqual([]);
  });

  it("explains the unconfirmed visual pair found in the reported batch", () => {
    expect(getBatchLaunchBlockers({ ...ready, unreviewedMatching: true })).toEqual(["matching"]);
    expect(batchLaunchBlockerTargets.matching).toBe("launch-matching-review");
  });

  it.each([
    [{ metaConfigured: false }, "meta"],
    [{ mediaReady: false }, "mediaLoading"],
    [{ mediaReady: false, mediaError: "Drive error" }, "mediaError"],
    [{ optionsLoading: true }, "optionsLoading"],
    [{ optionsError: "Meta error" }, "optionsError"],
    [{ copyLoading: true }, "copyLoading"],
    [{ copyError: "Copy error" }, "copyError"],
    [{ hasActiveCampaign: false }, "campaign"],
    [{ hasTemplate: false }, "template"],
    [{ adCount: 0 }, "media"],
    [{ countries: [] }, "countries"],
    [{ dailyBudget: "" }, "budget"],
    [{ dailyBudget: "0" }, "budget"],
    [{ dailyBudget: "-10" }, "budget"],
    [{ dailyBudget: "0.001" }, "budget"]
  ] as const)("gives a visible reason for %j", (change, reason) => {
    expect(getBatchLaunchBlockers({ ...ready, ...change })).toContain(reason);
    expect(batchLaunchBlockerTargets[reason]).toBeTruthy();
  });

  it.each([
    ["primaryText", "  ", "primaryText"],
    ["headline", "", "headline"],
    ["pageId", "", "page"],
    ["pageId", "not-a-page-id", "page"],
    ["landingUrl", "", "landingUrl"],
    ["landingUrl", "example.com", "landingUrl"],
    ["landingUrl", "javascript:alert(1)", "landingUrl"],
    ["landingUrl", "https://user:password@example.com", "landingUrl"]
  ])("explains missing or invalid %s", (field, value, reason) => {
    expect(getBatchLaunchBlockers({ ...ready, copy: { ...ready.copy, [field]: value } })).toContain(reason);
  });

  it("uses text alternatives consistently with server normalization", () => {
    expect(
      getBatchLaunchBlockers({
        ...ready,
        copy: { ...ready.copy, primaryText: "", headline: "", primaryTexts: ["", "Test"], headlines: ["", "Title"] }
      })
    ).toEqual([]);
  });

  it("does not require an adset budget in a campaign-budget campaign", () => {
    expect(getBatchLaunchBlockers({ ...ready, campaignBudget: true, dailyBudget: "" })).toEqual([]);
  });
});
