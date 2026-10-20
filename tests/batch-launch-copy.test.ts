import { describe, expect, it } from "vitest";
import { copyFromCreative, normalizeBatchCopy, templateCopySources } from "@/lib/batch-launch-copy";
import { buildCreativePayload, expandBatchDescriptionVariants, validateCopy } from "@/lib/batch-launch-plan";
import { copy, feed, story } from "./batch-launch-fixtures";
import type { BatchLaunchCopy } from "@/lib/batch-launch-types";

const variants = {
  ...copy,
  primaryTexts: Array.from({ length: 5 }, (_, i) => `Primary ${i + 1}`),
  headlines: Array.from({ length: 5 }, (_, i) => `Headline ${i + 1}`),
  descriptions: Array.from({ length: 5 }, (_, i) => `Description ${i + 1}`)
};
const assets = {
  bodies: variants.primaryTexts.map((text) => ({ text })),
  titles: variants.headlines.map((text) => ({ text })),
  descriptions: variants.descriptions.map((text) => ({ text }))
};

describe("reference creative copy", () => {
  it("imports all five text, headline and description variants with their own destination and identity", () => {
    const result = copyFromCreative({
      asset_feed_spec: {
        ...assets,
        link_urls: [{ website_url: copy.landingUrl }],
        call_to_action_types: [copy.callToAction]
      },
      object_story_spec: {
        page_id: copy.pageId,
        instagram_user_id: copy.instagramId,
        link_data: { message: "Do not append this stale fallback" }
      },
      url_tags: copy.urlTags
    });
    expect(result).toEqual({ copy: normalizeBatchCopy(variants), truncated: false });
  });
  it("deduplicates placement repeats before capping imported variants and flags overflow", () => {
    const bodies = [...assets.bodies, ...assets.bodies];
    expect(copyFromCreative({ asset_feed_spec: { bodies } })).toMatchObject({
      copy: { primaryTexts: variants.primaryTexts },
      truncated: false
    });
    expect(copyFromCreative({ asset_feed_spec: { bodies: [...bodies, { text: "Sixth" }] } })).toMatchObject({
      copy: { primaryTexts: variants.primaryTexts },
      truncated: true
    });
  });
  it.each(["link_data", "video_data"])("falls back to scalar %s fields without inventing variants", (key) => {
    const result = copyFromCreative({
      object_story_spec: {
        page_id: "123",
        [key]: {
          message: "Body",
          name: "Title",
          title: "Title",
          description: "Desc",
          link_description: "Desc",
          call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com" } }
        }
      }
    });
    expect(result.copy).toMatchObject({
      primaryTexts: ["Body"],
      headlines: ["Title"],
      descriptions: ["Desc"],
      landingUrl: "https://example.com",
      callToAction: "LEARN_MORE",
      pageId: "123"
    });
  });
  it("accepts missing descriptions, malformed optional fields and post-based page IDs", () => {
    expect(
      copyFromCreative({
        effective_object_story_id: "123_456",
        body: "Body",
        asset_feed_spec: { titles: [null, { text: 99 }, { text: "Title" }] }
      }).copy
    ).toMatchObject({ primaryTexts: ["Body"], headlines: ["Title"], descriptions: [], pageId: "123" });
    expect(copyFromCreative(null).copy.primaryTexts).toEqual([]);
  });
  it("keeps different ads separate and prefers active ads without claiming performance ranking", () => {
    const sources = templateCopySources([
      { id: "1", name: "A", status: "PAUSED", creative: { body: "Paused" } },
      { id: "2", name: "B", status: "ACTIVE", creative: { body: "Active" } },
      { id: "3", name: "C", status: "DELETED", creative: { body: "Deleted" } },
      { id: "4", name: "D", status: "ACTIVE", creative: null }
    ]);
    expect(sources.map((source) => source.id)).toEqual(["2", "1"]);
    expect(sources[0].copy.primaryTexts).toEqual(["Active"]);
  });
});

describe("multi-text validation and Meta payloads", () => {
  it.each(["primaryTexts", "headlines", "descriptions"] as const)(
    "rejects oversized or malformed %s instead of silently dropping variants",
    (key) => {
      for (const value of ["not-an-array", [null], Array(6).fill("text"), ["x".repeat(10001)]]) {
        expect(() => validateCopy({ ...copy, [key]: value } as BatchLaunchCopy)).toThrow();
      }
    }
  );
  it("rejects empty required arrays even when legacy scalar fields are filled", () => {
    expect(() => validateCopy({ ...copy, primaryTexts: [" "] })).toThrow();
    expect(() => validateCopy({ ...copy, headlines: [] })).toThrow();
    expect(() => validateCopy({ ...variants, primaryText: "", headline: "", descriptions: [] })).not.toThrow();
  });
  it("normalizes gaps and duplicate values, mirrors first nonempty variants, and accepts legacy jobs", () => {
    expect(normalizeBatchCopy({ ...copy, primaryTexts: ["", " Second ", "Second"] })).toMatchObject({
      primaryText: "Second",
      primaryTexts: ["Second"]
    });
    expect(normalizeBatchCopy(copy).primaryTexts).toEqual([copy.primaryText]);
    expect(() => validateCopy(copy)).not.toThrow();
  });
  it.each(["image", "video"] as const)("sends five alternatives in a single %s creative", (kind) => {
    const result = buildCreativePayload(
      { id: "ad", name: "Ad", feedFileId: "feed", storyFileId: null },
      [{ ...feed, kind }],
      { feed: { imageHash: "hash", videoId: "123", thumbnailUrl: "https://example.com/thumb" } },
      variants
    );
    expect(result).toMatchObject({ asset_feed_spec: { ...assets, optimization_type: "DEGREES_OF_FREEDOM" } });
    expect(result).toHaveProperty(
      `object_story_spec.${kind === "image" ? "link_data" : "video_data"}.message`,
      "Primary 1"
    );
  });
  it.each(["image", "video"] as const)(
    "keeps both %s placements in each description variant with all bodies and headlines",
    (kind) => {
      const groups = expandBatchDescriptionVariants(
        [{ id: "ad", name: "Ad", feedFileId: "feed", storyFileId: "story" }], variants
      );
      expect(groups).toHaveLength(5);
      expect(new Set(groups.map((group) => group.id)).size).toBe(5);
      for (const [index, group] of groups.entries()) {
        const result = buildCreativePayload(
          group,
          [{ ...feed, kind }, { ...story, kind }],
          { feed: { imageHash: "h1", videoId: "123" }, story: { imageHash: "h2", videoId: "456" } },
          variants
        );
        expect(result.name).toBe(`Ad - D${index + 1}`);
        const spec = (result as { asset_feed_spec: Record<string, unknown> }).asset_feed_spec;
        expect(spec.optimization_type).toBe("PLACEMENT");
        expect(spec[kind === "image" ? "images" : "videos"]).toHaveLength(2);
        expect(spec.descriptions).toEqual([
          { text: variants.descriptions[index], adlabels: [{ name: "batch_descriptions" }] }
        ]);
        for (const [field, label, count] of [
          ["bodies", "body_label", 5],
          ["titles", "title_label", 5],
          ["descriptions", "description_label", 1]
        ] as const) {
          expect(spec[field]).toHaveLength(count);
          for (const rule of spec.asset_customization_rules as Record<string, unknown>[]) {
            for (const asset of spec[field] as { adlabels: unknown[] }[])
              expect(asset.adlabels).toContainEqual(rule[label]);
          }
        }
      }
    }
  );
  it("rejects an unexpanded format pair instead of sending the known-invalid Meta payload", () => {
    expect(() => buildCreativePayload(
      { id: "ad", name: "Ad", feedFileId: "feed", storyFileId: "story" },
      [feed, story], { feed: { imageHash: "h1" }, story: { imageHash: "h2" } }, variants
    )).toThrow(/Anzeigenvarianten/);
  });
  it("ignores empty and duplicate descriptions and keeps single-format ads unchanged", () => {
    const pair = { id: "pair", name: "Pair", feedFileId: "feed", storyFileId: "story" };
    const single = { id: "single", name: "Single", feedFileId: "other", storyFileId: null };
    for (const descriptions of [[], ["One"], [" One ", "", "One"]]) {
      expect(expandBatchDescriptionVariants([pair, single], { ...copy, descriptions })).toEqual([pair, single]);
    }
    expect(expandBatchDescriptionVariants([pair, single], {
      ...copy, descriptions: [" One ", "", "Two", "One"]
    }).map((group) => [group.id, group.description])).toEqual([
      ["pair", "One"], ["pair:description:2", "Two"], ["single", undefined]
    ]);
  });
  it("keeps stable unique IDs, bounded names and individual primary text overrides", () => {
    const groups = [
      { id: "pair", name: "x".repeat(200), feedFileId: "feed", storyFileId: "story", primaryText: "Override" },
      { id: "pair-description-2", name: "Other", feedFileId: "other", storyFileId: null }
    ];
    const expanded = expandBatchDescriptionVariants(groups, variants);
    expect(new Set(expanded.map((group) => group.id)).size).toBe(6);
    expect(expanded.every((group) => group.name.length <= 200)).toBe(true);
    expect(expanded.slice(0, 5).every((group) => group.primaryText === "Override")).toBe(true);
    expect(expandBatchDescriptionVariants(groups, variants)).toEqual(expanded);
    expect(groups[0].name).toHaveLength(200);
  });
  it("honors per-ad body overrides without dropping the five headlines or descriptions", () => {
    const result = buildCreativePayload(
      { id: "ad", name: "Ad", feedFileId: "feed", storyFileId: null, primaryText: "Override" },
      [feed],
      { feed: { imageHash: "hash" } },
      variants
    );
    expect(result).toMatchObject({
      asset_feed_spec: { bodies: [{ text: "Override" }], titles: assets.titles, descriptions: assets.descriptions }
    });
  });
});
