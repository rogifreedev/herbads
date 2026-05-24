import { describe, expect, it } from "vitest";
import { calculateCreativePerformanceScore } from "@/lib/creative-score";
import type { PerformanceMetrics } from "@/lib/metrics";

function metrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    outboundClicks: 0,
    purchases: 0,
    purchaseValue: 0,
    engagement: 0,
    video3sViews: 0,
    thruplays: 0,
    ctr: null,
    cpc: null,
    cpm: null,
    roas: null,
    costPerPurchase: null,
    frequency: null,
    hookRate: null,
    holdRate: null,
    outboundCvr: null,
    ...overrides
  };
}

describe("calculateCreativePerformanceScore", () => {
  it("returns low confidence for creatives without enough data", () => {
    const score = calculateCreativePerformanceScore(metrics({ clicks: 10, impressions: 100, ctr: 10 }));

    expect(score.confidence).toBe(0);
    expect(score.components.dataQuality).toBe(0);
    expect(score.score).toBeGreaterThan(0);
  });

  it("ignores ROAS and CPA until at least two purchases exist", () => {
    const score = calculateCreativePerformanceScore(metrics({ spend: 100, impressions: 2000, purchases: 1, purchaseValue: 600, roas: 6, costPerPurchase: 100, ctr: 2 }));

    expect(score.components.roas).toBeNull();
    expect(score.components.cpa).toBeNull();
  });

  it("uses conversion, outbound and video components when enough data exists", () => {
    const score = calculateCreativePerformanceScore(
      metrics({
        spend: 100,
        impressions: 2000,
        purchases: 4,
        purchaseValue: 400,
        roas: 4,
        costPerPurchase: 25,
        ctr: 3,
        outboundCvr: 8,
        hookRate: 30,
        holdRate: 25
      })
    );

    expect(score.components.roas).toBe(100);
    expect(score.components.cpa).toBeGreaterThan(0);
    expect(score.components.outboundCvr).toBe(100);
    expect(score.components.hookRate).toBe(100);
    expect(score.components.holdRate).toBe(100);
    expect(score.score).toBeGreaterThan(70);
  });
});
