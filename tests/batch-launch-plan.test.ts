import { describe, expect, it } from "vitest";
import {
  batchAdsetName,
  budgetMinorUnits,
  buildAdSetPayload,
  buildCreativePayload,
  groupBatchMedia,
  mediaPlacement,
  validateCopy,
  validateGroups,
  settingsFromAdset,
  validateLaunchActivation
} from "@/lib/batch-launch-plan";
import type { BatchAdGroup, BatchLaunchCopy } from "@/lib/batch-launch-types";
import { campaign, copy, feed, media, settings, story, template } from "./batch-launch-fixtures";

describe("batch adset names", () => {
  it("prefixes the batch name with the German date and an underscore", () => {
    expect(batchAdsetName(" 01_Batch ", new Date("2026-09-16T10:00:00Z"))).toBe("16.09.2026_01_Batch");
  });
  it("uses the Berlin day across midnight, year boundaries and daylight saving time", () => {
    expect(batchAdsetName("Batch", new Date("2026-09-15T22:30:00Z"))).toBe("16.09.2026_Batch");
    expect(batchAdsetName("Batch", new Date("2026-12-31T23:30:00Z"))).toBe("01.01.2027_Batch");
    expect(batchAdsetName("Batch", new Date("2026-12-31T22:30:00Z"))).toBe("31.12.2026_Batch");
  });
});

describe("batch media matching", () => {
  it("pairs motif variants across format folders into exactly one ad", () => {
    expect(groupBatchMedia([feed, story])).toEqual([
      { id: "feed", name: "Motif_1_1x1", feedFileId: "feed", storyFileId: "story" }
    ]);
  });
  it("supports 4:5 feed assets", () => {
    expect(mediaPlacement(1080, 1350)).toBe("feed");
    expect(mediaPlacement(1080, 1920)).toBe("story");
    expect(mediaPlacement(null, null)).toBe("unknown");
    expect(mediaPlacement(1920, 1080)).toBe("unknown");
  });
  it("never pairs different motif numbers or ambiguous variants", () => {
    expect(groupBatchMedia([feed, { ...story, path: "Export_9x16/Motif_2_9x16.png" }])).toHaveLength(2);
    expect(groupBatchMedia([feed, { ...feed, id: "duplicate" }, story])).toHaveLength(3);
    expect(groupBatchMedia([feed, { ...story, kind: "video" }])).toHaveLength(2);
  });
  it("preserves non-format subfolders", () => {
    expect(
      groupBatchMedia([
        { ...feed, path: `Batch1/${feed.path}` },
        { ...story, path: `Batch2/${story.path}` }
      ])
    ).toHaveLength(2);
  });
  it("accepts manual pairs and excluded files, rejecting duplicate or foreign files", () => {
    const group = { id: "a", name: "Ad", feedFileId: "feed", storyFileId: "story" };
    expect(validateGroups([group], [feed, story, media("excluded")])).toHaveLength(2);
    expect(() => validateGroups([group, { ...group, id: "b" }], [feed, story])).toThrow(/mehrfach/);
    expect(() => validateGroups([{ ...group, feedFileId: "foreign" }], [feed, story])).toThrow(/nicht im Batch/);
    expect(() => validateGroups([group], [feed, { ...story, kind: "video" }])).toThrow(/Bild und Video/);
    expect(() => validateGroups([{ ...group, id: "__proto__" }], [feed, story])).toThrow();
  });
});

describe("paused adset payloads", () => {
  it("inherits conversion configuration but replaces geographic/language settings", () => {
    const payload = buildAdSetPayload("Batch", campaign, template, settings, "EUR");
    expect(payload).toMatchObject({
      status: "PAUSED",
      campaign_id: campaign.id,
      daily_budget: 6050,
      promoted_object: template.promoted_object,
      targeting: { age_min: 25, genders: [2], geo_locations: { countries: ["DE", "AT"] }, locales: [5] }
    });
    expect(payload.targeting).not.toHaveProperty("excluded_geo_locations");
    expect(template.targeting.geo_locations.countries).toEqual(["IT"]);
  });
  it("leaves campaign budgets unchanged and omits adset budget and bidding", () => {
    const payload = buildAdSetPayload(
      "Batch",
      { ...campaign, dailyBudget: 10000 },
      template,
      { ...settings, dailyBudget: "" },
      "EUR"
    );
    expect(payload).not.toHaveProperty("daily_budget");
    expect(payload).not.toHaveProperty("bid_strategy");
    expect(payload.status).toBe("PAUSED");
  });
  it("clears inherited language restrictions when all languages are selected", () => {
    expect(
      buildAdSetPayload("Batch", campaign, template, { ...settings, locales: [] }, "EUR").targeting
    ).not.toHaveProperty("locales");
  });
  it("uses the selected destination campaign without modifying the source template", () => {
    expect(buildAdSetPayload("Batch", { ...campaign, id: "456" }, template, settings, "EUR")).toHaveProperty(
      "campaign_id",
      "456"
    );
    expect(template.campaign_id).toBe(campaign.id);
  });
  it("preserves geographic details and exclusions when using the template countries", () => {
    const result = buildAdSetPayload("Batch", campaign, template, { ...settings, countries: ["IT"] }, "EUR");
    expect(result.targeting).toMatchObject({
      geo_locations: template.targeting.geo_locations,
      excluded_geo_locations: template.targeting.excluded_geo_locations
    });
  });
  it("copies the template budget, countries and language IDs", () => {
    const source = { id: "987", name: "Source", campaignId: "789", raw: { ...template, daily_budget: "6050" } };
    expect(settingsFromAdset(source, "EUR")).toEqual({
      dailyBudget: "60.50",
      countries: ["IT"],
      locales: [{ id: 4, name: "4" }]
    });
    expect(settingsFromAdset({ ...source, raw: { daily_budget: "500" } }, "JPY").dailyBudget).toBe("500");
    expect(settingsFromAdset(undefined, "EUR").dailyBudget).toBe("");
  });
  it("requires explicit activation and an active campaign with confirmed budget", () => {
    const budget = { dailyBudget: 0, lifetimeBudget: 0 };
    expect(() => validateLaunchActivation(undefined, { ...campaign, status: "PAUSED" })).not.toThrow();
    expect(() => validateLaunchActivation("true", campaign, budget)).toThrow();
    expect(() => validateLaunchActivation(true, { ...campaign, status: "PAUSED" }, budget)).toThrow(
      /bereits aktive Kampagne/
    );
    expect(() => validateLaunchActivation(true, campaign)).toThrow(/nicht bestaetigt/);
    expect(() => validateLaunchActivation(true, { ...campaign, dailyBudget: 10000 }, budget)).toThrow(/geaendert/);
    expect(() => validateLaunchActivation(true, campaign, budget)).not.toThrow();
  });
  it("rejects catalog templates and incomplete bidding", () => {
    expect(() =>
      buildAdSetPayload("Batch", campaign, { ...template, promoted_object: { product_set_id: "9" } }, settings, "EUR")
    ).toThrow(/Katalog/);
    expect(() =>
      buildAdSetPayload("Batch", campaign, { ...template, bid_strategy: "COST_CAP" }, settings, "EUR")
    ).toThrow(/Gebotslimit/);
    expect(() => buildAdSetPayload("Batch", campaign, template, { ...settings, countries: [] }, "EUR")).toThrow();
  });
  it("validates monetary precision for each currency", () => {
    expect(budgetMinorUnits("60.50", "EUR")).toBe(6050);
    expect(budgetMinorUnits("100", "JPY")).toBe(100);
    for (const value of ["0", "-1", "NaN", "Infinity", "1.001"]) expect(() => budgetMinorUnits(value, "EUR")).toThrow();
  });
});

describe("Meta creative payloads", () => {
  const group: BatchAdGroup = { id: "ad-1", name: "Ad", feedFileId: "feed", storyFileId: "story" };
  it("uses placement assets in one image creative, never a carousel", () => {
    const payload = buildCreativePayload(
      group,
      [feed, story],
      { feed: { imageHash: "h1" }, story: { imageHash: "h2" } },
      copy
    );
    expect(payload).toMatchObject({
      object_story_spec: { page_id: "123", instagram_user_id: "456" },
      asset_feed_spec: {
        ad_formats: ["SINGLE_IMAGE"],
        optimization_type: "PLACEMENT",
        images: [
          { hash: "h1", adlabels: [{ name: "batch_feed" }] },
          { hash: "h2", adlabels: [{ name: "batch_story" }] }
        ]
      }
    });
    expect(payload).not.toHaveProperty("object_story_spec.link_data");
  });
  it("sets video thumbnails and video placement labels", () => {
    const payload = buildCreativePayload(
      group,
      [
        { ...feed, kind: "video" },
        { ...story, kind: "video" }
      ],
      {
        feed: { videoId: "11", thumbnailUrl: "https://example.com/1.jpg" },
        story: { videoId: "22", thumbnailUrl: "https://example.com/2.jpg" }
      },
      copy
    );
    expect(payload).toHaveProperty("asset_feed_spec.ad_formats", ["SINGLE_VIDEO"]);
    expect(payload).toHaveProperty("asset_feed_spec.asset_customization_rules.0.video_label.name", "batch_story");
  });
  it("allows an individual text on each ad and falls back to the batch text", () => {
    const single = { ...group, storyFileId: null, primaryText: "Individual text" };
    expect(buildCreativePayload(single, [feed], { feed: { imageHash: "hash" } }, copy)).toHaveProperty(
      "object_story_spec.link_data.message",
      "Individual text"
    );
    expect(
      buildCreativePayload({ ...single, primaryText: " " }, [feed], { feed: { imageHash: "hash" } }, copy)
    ).toHaveProperty("object_story_spec.link_data.message", copy.primaryText);
  });
  it("accepts text suggestions with metrics and rejects malformed required fields", () => {
    expect(() => validateCopy({ ...copy, spend: 200, purchases: 5 } as BatchLaunchCopy)).not.toThrow();
    expect(() => validateCopy({ ...copy, description: undefined } as unknown as BatchLaunchCopy)).toThrow(
      /Anzeigentexte/
    );
    expect(() => validateCopy({ ...copy, landingUrl: "javascript:alert(1)" })).toThrow(/Ziel-URL/);
  });
});
