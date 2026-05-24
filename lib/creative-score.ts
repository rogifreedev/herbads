import "server-only";

import type { PerformanceMetrics } from "@/lib/metrics";

export type CreativePerformanceScore = {
  score: number;
  confidence: number;
  components: {
    roas: number | null;
    cpa: number | null;
    ctr: number | null;
    outboundCvr: number | null;
    hookRate: number | null;
    holdRate: number | null;
    conversionVolume: number;
    dataQuality: number;
  };
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scoreHigherIsBetter(value: number | null, excellent: number) {
  if (value === null || excellent <= 0) return null;
  return clamp((value / excellent) * 100);
}

function scoreLowerIsBetter(value: number | null, excellent: number, poor: number) {
  if (value === null || excellent <= 0 || poor <= excellent) return null;
  if (value <= excellent) return 100;
  if (value >= poor) return 0;
  return clamp(((poor - value) / (poor - excellent)) * 100);
}

function weightedAverage(items: Array<{ value: number | null; weight: number }>) {
  const valid = items.filter((item) => item.value !== null);
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (weightSum === 0) return 0;
  return valid.reduce((sum, item) => sum + (item.value ?? 0) * item.weight, 0) / weightSum;
}

export function calculateCreativePerformanceScore(metrics: PerformanceMetrics): CreativePerformanceScore {
  const hasEnoughConversionData = metrics.purchases >= 2;
  const roas = hasEnoughConversionData ? scoreHigherIsBetter(metrics.roas, 3) : null;
  const cpa = hasEnoughConversionData ? scoreLowerIsBetter(metrics.costPerPurchase, 20, 80) : null;
  const ctr = scoreHigherIsBetter(metrics.ctr, 2.5);
  const outboundCvr = scoreHigherIsBetter(metrics.outboundCvr, 5);
  const hookRate = scoreHigherIsBetter(metrics.hookRate, 25);
  const holdRate = scoreHigherIsBetter(metrics.holdRate, 20);
  const conversionVolume = clamp((metrics.purchases / 10) * 100);
  const dataQuality = clamp(Math.min(metrics.spend / 100, metrics.impressions / 1000) * 100);
  const performance = weightedAverage([
    { value: roas, weight: 28 },
    { value: cpa, weight: 20 },
    { value: ctr, weight: 20 },
    { value: outboundCvr, weight: 10 },
    { value: hookRate, weight: 5 },
    { value: holdRate, weight: 5 },
    { value: conversionVolume, weight: 10 },
    { value: dataQuality, weight: 2 }
  ]);

  return {
    score: Math.round(performance),
    confidence: Math.round(dataQuality),
    components: {
      roas: roas === null ? null : Math.round(roas),
      cpa: cpa === null ? null : Math.round(cpa),
      ctr: ctr === null ? null : Math.round(ctr),
      outboundCvr: outboundCvr === null ? null : Math.round(outboundCvr),
      hookRate: hookRate === null ? null : Math.round(hookRate),
      holdRate: holdRate === null ? null : Math.round(holdRate),
      conversionVolume: Math.round(conversionVolume),
      dataQuality: Math.round(dataQuality)
    }
  };
}
