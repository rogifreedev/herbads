import { describe, expect, it } from "vitest";
import { aggregateInsightRows } from "@/lib/metrics";

describe("aggregateInsightRows", () => {
  it("aggregates spend, revenue and derived KPIs", () => {
    const metrics = aggregateInsightRows([
      {
        spend: "50",
        impressions: 1000,
        reach: 800,
        clicks: 40,
        link_clicks: 20,
        outbound_clicks: 15,
        purchases: 3,
        purchase_value: "180",
        engagement: 12,
        video_3s_views: 250,
        thruplays: 50
      },
      {
        spend: 25,
        impressions: 500,
        reach: 400,
        clicks: 10,
        link_clicks: 5,
        outbound_clicks: null,
        purchases: 1,
        purchase_value: 70,
        engagement: 5,
        video_3s_views: 100,
        thruplays: 25
      }
    ]);

    expect(metrics.spend).toBe(75);
    expect(metrics.purchaseValue).toBe(250);
    expect(metrics.outboundClicks).toBe(20);
    expect(metrics.ctr).toBeCloseTo(3.3333, 3);
    expect(metrics.roas).toBeCloseTo(3.3333, 3);
    expect(metrics.costPerPurchase).toBeCloseTo(18.75, 2);
    expect(metrics.hookRate).toBeCloseTo(23.3333, 3);
    expect(metrics.holdRate).toBeCloseTo(21.4285, 3);
    expect(metrics.outboundCvr).toBe(20);
  });
});
