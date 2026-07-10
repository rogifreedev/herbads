import { describe, expect, it } from "vitest";
import {
  DEFAULT_META_DAILY_LOOKBACK_DAYS,
  getMetaDailySyncRange,
  normalizeMetaAccountStatus
} from "@/lib/meta/daily-sync";

describe("getMetaDailySyncRange", () => {
  it("reloads yesterday and the seven preceding days by default", () => {
    expect(getMetaDailySyncRange(new Date("2026-07-10T03:00:00Z"), DEFAULT_META_DAILY_LOOKBACK_DAYS)).toEqual({
      since: "2026-07-02",
      until: "2026-07-09"
    });
  });

  it("falls back to the default for invalid configuration", () => {
    expect(getMetaDailySyncRange(new Date("2026-01-02T03:00:00Z"), Number.NaN)).toEqual({
      since: "2025-12-25",
      until: "2026-01-01"
    });
  });
});

describe("normalizeMetaAccountStatus", () => {
  it("keeps Meta status 1 eligible for daily sync", () => {
    expect(normalizeMetaAccountStatus(1)).toBe("active");
  });

  it("keeps non-active Meta states readable", () => {
    expect(normalizeMetaAccountStatus(2)).toBe("disabled");
    expect(normalizeMetaAccountStatus(101)).toBe("closed");
  });
});
