import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import type { InsightDateRange } from "@/lib/date-filters";
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

export type PerformanceBreakdownDimension = "country" | "age" | "gender";

export type PerformanceBreakdownRow = {
  dimension: PerformanceBreakdownDimension;
  value: string;
  metrics: PerformanceMetrics;
  spendShare: number | null;
  conversionShare: number | null;
  reachShare: number | null;
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

type AggregatedInsightRow = InsightRow & {
  row_count: number | string | null;
};

type BreakdownMetricRow = InsightRow & {
  breakdown_type: string | null;
  breakdown_value: string | null;
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

async function getClientPerformanceMetricsUncached(clientId: string, since?: string | null, until?: string | null) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("get_client_performance_metrics", {
    p_client_id: clientId,
    p_since: since ?? null,
    p_until: until ?? null
  });

  if (error) {
    return { metrics: emptyMetrics, hasData: false, error: error.message };
  }

  const row = ((data ?? [])[0] ?? null) as AggregatedInsightRow | null;
  return {
    metrics: row ? aggregateInsightRows([row]) : emptyMetrics,
    hasData: toNumber(row?.row_count) > 0,
    error: null
  };
}

export const getClientPerformanceMetrics = unstable_cache(
  getClientPerformanceMetricsUncached,
  ["client-performance-metrics-v3"],
  { revalidate: 120, tags: [CACHE_TAGS.metrics] }
);

export function getClientPerformanceMetricsForRange(clientId: string, dateRange?: InsightDateRange) {
  return getClientPerformanceMetrics(clientId, dateRange?.since ?? null, dateRange?.until ?? null);
}

function isPerformanceBreakdownDimension(value: string | null): value is PerformanceBreakdownDimension {
  return value === "country" || value === "age" || value === "gender";
}

function share(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : null;
}

function buildBreakdownRows(rows: BreakdownMetricRow[], dimension: PerformanceBreakdownDimension): PerformanceBreakdownRow[] {
  const scopedRows = rows.filter((row) => row.breakdown_type === dimension && row.breakdown_value);
  const totals = aggregateInsightRows(scopedRows);

  return scopedRows
    .map((row) => {
      const metrics = aggregateInsightRows([row]);

      return {
        dimension,
        value: row.breakdown_value as string,
        metrics,
        spendShare: share(metrics.spend, totals.spend),
        conversionShare: share(metrics.purchases, totals.purchases),
        reachShare: share(metrics.reach, totals.reach)
      };
    })
    .sort((a, b) => b.metrics.spend - a.metrics.spend || b.metrics.purchases - a.metrics.purchases || b.metrics.reach - a.metrics.reach || a.value.localeCompare(b.value));
}

async function getClientPerformanceBreakdownsUncached(clientId: string, since?: string | null, until?: string | null) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("get_client_performance_breakdowns", {
    p_client_id: clientId,
    p_since: since ?? null,
    p_until: until ?? null
  });

  if (error) {
    return { countries: [], ages: [], genders: [], hasData: false, error: error.message };
  }

  const rows = ((data ?? []) as BreakdownMetricRow[]).filter((row) => isPerformanceBreakdownDimension(row.breakdown_type));

  return {
    countries: buildBreakdownRows(rows, "country"),
    ages: buildBreakdownRows(rows, "age"),
    genders: buildBreakdownRows(rows, "gender"),
    hasData: rows.length > 0,
    error: null
  };
}

export const getClientPerformanceBreakdowns = unstable_cache(
  getClientPerformanceBreakdownsUncached,
  ["client-performance-breakdowns-v2"],
  { revalidate: 120, tags: [CACHE_TAGS.metrics] }
);

export function getClientPerformanceBreakdownsForRange(clientId: string, dateRange?: InsightDateRange) {
  return getClientPerformanceBreakdowns(clientId, dateRange?.since ?? null, dateRange?.until ?? null);
}

async function getGlobalPerformanceMetricsUncached() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("get_global_performance_metrics");

  if (error) {
    return { metrics: emptyMetrics, hasData: false, error: error.message };
  }

  const row = ((data ?? [])[0] ?? null) as AggregatedInsightRow | null;
  return {
    metrics: row ? aggregateInsightRows([row]) : emptyMetrics,
    hasData: toNumber(row?.row_count) > 0,
    error: null
  };
}

export const getGlobalPerformanceMetrics = unstable_cache(
  getGlobalPerformanceMetricsUncached,
  ["global-performance-metrics-v2"],
  { revalidate: 120, tags: [CACHE_TAGS.metrics] }
);

// Fixed de-DE formatting by design; de/it number and date formats are near-identical
// (1.234,56 € / 07.07.2026 vs 07/07/2026) — revisit if an en locale lands.
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
