import { describe, expect, it } from "vitest";
import { commentFetchSince, latestCommentWatermark } from "@/lib/meta-comment-sync-watermark";

describe("commentFetchSince", () => {
  it("uses the latest stored comment instead of the later sync time", () => {
    expect(commentFetchSince({
      last_synced_at: "2026-07-23T08:04:31.463Z",
      last_comment_created_at: "2026-07-22T13:16:14.000Z"
    })).toBe("2026-07-22T13:16:14.000Z");
  });

  it("looks back seven days when a story has no stored comment watermark", () => {
    expect(commentFetchSince({
      last_synced_at: "2026-07-23T08:04:31.463Z",
      last_comment_created_at: null
    })).toBe("2026-07-16T08:04:31.463Z");
  });

  it("does a full initial fetch for a story without sync state", () => {
    expect(commentFetchSince(undefined)).toBeNull();
  });
});

describe("latestCommentWatermark", () => {
  it("preserves the previous watermark when an incremental fetch is empty", () => {
    expect(latestCommentWatermark("2026-07-22T13:16:14.000Z", [])).toBe("2026-07-22T13:16:14.000Z");
  });

  it("advances to the latest newly fetched comment", () => {
    expect(latestCommentWatermark("2026-07-22T13:16:14.000Z", [
      "2026-07-22T14:00:00.000Z",
      "2026-07-22T13:30:00.000Z"
    ])).toBe("2026-07-22T14:00:00.000Z");
  });
});
