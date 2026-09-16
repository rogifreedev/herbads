import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { matchBatchMedia, selectVisualPairs } from "@/lib/batch-media-matching";
import { feed, story } from "./batch-launch-fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("conservative visual pair selection", () => {
  it("requires strong, mutually unique matches, not export order", () => {
    const weak = { feed, story, score: 7 };
    expect(selectVisualPairs([weak])).toEqual([]);
    const best = { feed, story, score: 24 };
    expect(selectVisualPairs([best, { feed, story: { ...story, id: "other" }, score: 10 }])).toEqual([best]);
    expect(selectVisualPairs([best, { feed, story: { ...story, id: "other" }, score: 22 }])).toEqual([]);
    expect(selectVisualPairs([best, { feed: { ...feed, id: "other" }, story, score: 22 }])).toEqual([]);
  });
});

describe("visual batch matching", () => {
  it("keeps exact name pairs without downloading thumbnails", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await matchBatchMedia([feed, story]);
    expect(result.groups).toHaveLength(1);
    expect(result.matchingUnavailable).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never visually pairs video thumbnails or distinct motif folders", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await matchBatchMedia([
          { ...feed, kind: "video", path: "1.mp4" },
          { ...story, kind: "video", path: "9.mp4" }
        ])
      ).groups
    ).toHaveLength(2);
    expect(
      (
        await matchBatchMedia([
          { ...feed, path: "German/1.png" },
          { ...story, path: "Italian/9.png" }
        ])
      ).groups
    ).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses real image features to match differently named crops and rejects duplicate alternatives", async () => {
    let seed = 91;
    const pixels = Buffer.alloc(80 * 140 * 3);
    for (let i = 0; i < pixels.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const large = await sharp(pixels, { raw: { width: 80, height: 140, channels: 3 } })
      .resize(800, 1400)
      .png()
      .toBuffer();
    const square = await sharp(large).extract({ left: 0, top: 300, width: 800, height: 800 }).png().toBuffer();
    const a = {
      ...feed,
      id: "visual-feed",
      path: "1.png",
      thumbnailUrl: "https://lh3.googleusercontent.com/feed=s220"
    };
    const b = {
      ...story,
      id: "visual-story",
      path: "9.png",
      thumbnailUrl: "https://lh3.googleusercontent.com/story=s220"
    };
    const originalFetch = globalThis.fetch;
    const fetch = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname !== "lh3.googleusercontent.com") return originalFetch(input, init);
      return new Response(new Uint8Array(url.pathname.includes("feed") ? square : large).buffer, {
        headers: { "content-type": "image/png" }
      });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await matchBatchMedia([a, b]);
    expect(result.matchingUnavailable).toBe(false);
    expect(result.groups).toEqual([
      expect.objectContaining({ feedFileId: a.id, storyFileId: b.id, matchMethod: "visual" })
    ]);
    const calls = fetch.mock.calls.length;
    await matchBatchMedia([a, b]);
    expect(fetch).toHaveBeenCalledTimes(calls);
    const ambiguous = await matchBatchMedia([a, b, { ...b, id: "duplicate-story", path: "10.png" }]);
    expect(ambiguous.groups).toHaveLength(3);
    expect(ambiguous.groups.some((g) => g.matchMethod === "visual")).toBe(false);
  }, 20000);
  it("falls back visibly without guessing when thumbnails are missing or untrusted", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await matchBatchMedia([
      { ...feed, id: "missing-feed", path: "1.png", thumbnailUrl: "http://localhost/private" },
      { ...story, path: "9.png", thumbnailUrl: null }
    ]);
    expect(result.matchingUnavailable).toBe(true);
    expect(result.groups).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});
