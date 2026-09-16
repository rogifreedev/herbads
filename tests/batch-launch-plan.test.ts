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
  adsetGeography,
  adsetLocales,
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
  it.each([
    ["Feed/Motif 1 (1x1).png", "Stories/Motif 1 [9x16].png"],
    ["1_1/Motif 1.jpg", "9_16/Motif 1.png"],
    ["1\u00d71/Motif 1.jpg", "9\u00d716/Motif 1.png"],
    ["Motif 1 - 1080x1080.png", "Motif 1 - 1080x1920.png"]
  ])("matches format labels and export punctuation: %s", (feedPath, storyPath) => {
    const groups = groupBatchMedia([
      { ...feed, path: feedPath },
      { ...story, path: storyPath }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ feedFileId: "feed", storyFileId: "story" });
  });
  it("preserves export numbers and folder boundaries", () => {
    for (const number of ["11", "45", "916"]) {
      expect(
        groupBatchMedia([
          { ...feed, path: `${number}.png` },
          { ...story, path: "9.png" }
        ])
      ).toHaveLength(2);
    }
    expect(
      groupBatchMedia([
        { ...feed, path: "DE/Ad/1.png" },
        { ...story, path: "DE Ad/1.png" }
      ])
    ).toHaveLength(2);
  });
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
  it("inherits all explicit language IDs, including string IDs, without country-based guesses", () => {
    const raw = { ...template, targeting: { geo_locations: { countries: ["IT"] }, locales: ["5", 4, 5, "9999"] } };
    const inherited = settingsFromAdset({ id: "987", name: "Source", campaignId: "789", raw }, "EUR");
    expect(inherited.locales).toEqual([
      { id: 5, name: "5" },
      { id: 4, name: "4" },
      { id: 9999, name: "9999" }
    ]);
    expect(
      buildAdSetPayload("Batch", campaign, raw, { ...inherited, dailyBudget: "15" }, "EUR").targeting
    ).toHaveProperty("locales", [5, 4, 9999]);
  });
  it.each([undefined, {}, { locales: [] }, { geo_locations: { countries: ["IT"] } }])(
    "keeps all languages when the source has no language restriction: %j",
    (targeting) => {
      expect(adsetLocales(targeting)).toEqual([]);
    }
  );
  it("rejects malformed language IDs instead of coercing booleans or empty strings", () => {
    expect(adsetLocales({ locales: [true, false, null, "", 0, -1, "5oops", 1.5, Infinity, "5", 5] })).toEqual([
      { id: 5, name: "5" }
    ]);
    expect(adsetLocales({ locales: "5" })).toEqual([]);
  });
  it("inherits Italy from the Lana city target without expanding its 30 km radius", () => {
    const geo = {
      cities: [{ key: "1182606", name: "Lana", country: "IT", radius: 30, distance_unit: "kilometer" }],
      location_types: ["frequently_in", "home", "recent"]
    };
    const raw = { ...template, daily_budget: "1500", targeting: { ...template.targeting, geo_locations: geo } };
    const inherited = settingsFromAdset({ id: "987", name: "City source", campaignId: "789", raw }, "EUR");
    expect(inherited.countries).toEqual(["IT"]);
    expect(inherited.dailyBudget).toBe("15.00");
    const payload = buildAdSetPayload("Batch", campaign, raw, inherited, "EUR");
    expect(payload.targeting).toMatchObject({
      geo_locations: geo,
      excluded_geo_locations: raw.targeting.excluded_geo_locations
    });
    expect(payload.targeting).not.toHaveProperty("geo_locations.countries");
    expect(raw.targeting.geo_locations).toEqual(geo);
    expect(adsetGeography(raw.targeting).locations).toEqual(["Lana (30 km)"]);
  });
  it.each([
    ["regions", { key: "127", name: "Tyrol", country: "AT" }, "AT"],
    ["zips", { key: "DE:10115", country: "DE" }, "DE"]
  ])("inherits and preserves %s targeting", (field, location, country) => {
    const raw = { ...template, targeting: { geo_locations: { [field]: [location] } } };
    const inherited = settingsFromAdset({ id: "987", name: "Local source", campaignId: "789", raw }, "EUR");
    expect(inherited.countries).toEqual([country]);
    expect(buildAdSetPayload("Batch", campaign, raw, { ...inherited, dailyBudget: "15" }, "EUR").targeting).toEqual(
      raw.targeting
    );
  });
  it("combines explicit countries and location countries without adding excluded countries", () => {
    expect(
      adsetGeography({
        geo_locations: {
          countries: ["IT", "DE"],
          cities: [
            { country: "it", name: "Lana" },
            { country: "AT", name: "Innsbruck" }
          ],
          regions: [{ country: "AT" }],
          country_groups: ["worldwide"]
        },
        excluded_geo_locations: { cities: [{ country: "FR", name: "Paris" }] }
      }).countries
    ).toEqual(["IT", "DE", "AT"]);
  });
  it("only replaces local targeting when the country selection changes", () => {
    const raw = {
      ...template,
      targeting: { ...template.targeting, geo_locations: { regions: [{ key: "127", country: "AT" }] } }
    };
    const payload = buildAdSetPayload("Batch", campaign, raw, { ...settings, countries: ["DE"] }, "EUR");
    expect(payload.targeting).toHaveProperty("geo_locations", { countries: ["DE"] });
    expect(payload.targeting).not.toHaveProperty("excluded_geo_locations");
  });
  it("does not guess country codes from location names or unknown coordinates", () => {
    expect(
      adsetGeography({
        geo_locations: {
          cities: [null, { name: "Lana" }, { country: "invalid" }],
          custom_locations: [{ latitude: 46.6, longitude: 11.1 }]
        }
      }).countries
    ).toEqual([]);
    expect(adsetGeography(undefined)).toEqual({ countries: [], locations: [] });
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
