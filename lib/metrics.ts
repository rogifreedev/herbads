import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type PerformanceMetrics = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  outboundClicks: number;
  purchases: number;
  purchaseValue: number;
  engagement: number;
  video3sViews: number;
  thruplays: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  costPerPurchase: number | null;
  frequency: number | null;
  hookRate: number | null;
  holdRate: number | null;
  outboundCvr: number | null;
};

type InsightRow = {
  spend: number | string | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  link_clicks: number | null;
  outbound_clicks?: number | null;
  purchases: number | null;
  purchase_value: number | string | null;
  engagement: number | null;
  video_3s_views: number | null;
  thruplays: number | null;
};

export const emptyMetrics: PerformanceMetrics = {
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
  outboundCvr: null
};

export function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function aggregateInsightRows(rows: InsightRow[]): PerformanceMetrics {
  const totals = rows.reduce(
    (sum, row) => ({
      spend: sum.spend + toNumber(row.spend),
      impressions: sum.impressions + toNumber(row.impressions),
      reach: sum.reach + toNumber(row.reach),
      clicks: sum.clicks + toNumber(row.clicks),
      linkClicks: sum.linkClicks + toNumber(row.link_clicks),
      outboundClicks: sum.outboundClicks + toNumber(row.outbound_clicks ?? row.link_clicks),
      purchases: sum.purchases + toNumber(row.purchases),
      purchaseValue: sum.purchaseValue + toNumber(row.purchase_value),
      engagement: sum.engagement + toNumber(row.engagement),
      video3sViews: sum.video3sViews + toNumber(row.video_3s_views),
      thruplays: sum.thruplays + toNumber(row.thruplays)
    }),
    {
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
      thruplays: 0
    }
  );

  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
    roas: totals.spend > 0 ? totals.purchaseValue / totals.spend : null,
    costPerPurchase: totals.purchases > 0 ? totals.spend / totals.purchases : null,
    frequency: totals.reach > 0 ? totals.impressions / totals.reach : null,
    hookRate: totals.impressions > 0 ? (totals.video3sViews / totals.impressions) * 100 : null,
    holdRate: totals.video3sViews > 0 ? (totals.thruplays / totals.video3sViews) * 100 : null,
    outboundCvr: totals.outboundClicks > 0 ? (totals.purchases / totals.outboundClicks) * 100 : null
  };
}

async function getClientPerformanceMetricsUncached(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("creative_insights_daily")
    .select("spend,impressions,reach,clicks,link_clicks,outbound_clicks,purchases,purchase_value,engagement,video_3s_views,thruplays")
    .eq("client_id", clientId);

  if (error) {
    return { metrics: emptyMetrics, hasData: false, error: error.message };
  }

  return { metrics: aggregateInsightRows(data ?? []), hasData: Boolean(data?.length), error: null };
}

export const getClientPerformanceMetrics = unstable_cache(
  getClientPerformanceMetricsUncached,
  ["client-performance-metrics-v1"],
  { revalidate: 120 }
);

async function getGlobalPerformanceMetricsUncached() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("creative_insights_daily")
    .select("spend,impressions,reach,clicks,link_clicks,outbound_clicks,purchases,purchase_value,engagement,video_3s_views,thruplays");

  if (error) {
    return { metrics: emptyMetrics, hasData: false, error: error.message };
  }

  return { metrics: aggregateInsightRows(data ?? []), hasData: Boolean(data?.length), error: null };
}

export const getGlobalPerformanceMetrics = unstable_cache(
  getGlobalPerformanceMetricsUncached,
  ["global-performance-metrics-v1"],
  { revalidate: 120 }
);

export function formatCurrency(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number | null, digits = 2) {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null) {
  if (value === null) return "–";
  return `${formatDecimal(value, 2)}%`;
}

export function formatDate(value: string | null) {
  if (!value) return "–";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
