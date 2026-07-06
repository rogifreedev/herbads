import "server-only";

import { calculateCreativePerformanceScore, type CreativePerformanceScore } from "@/lib/creative-score";
import type { InsightDateRange } from "@/lib/date-filters";
import { aggregateInsightRows, emptyMetrics, type PerformanceMetrics } from "@/lib/metrics";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getBatchOverview, type BatchMetaMatch, type BatchOverviewItem } from "@/lib/batches";

type InsightRow = {
  ad_id: string | null;
  adset_id: string | null;
  campaign_id: string | null;
  creative_id: string | null;
  date: string | null;
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

type MetaAdRow = {
  id: string;
  campaign_id: string | null;
  adset_id: string | null;
  creative_id: string | null;
};

type SupabaseQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type BatchPerformanceItem = {
  id: string;
  sourceFolderId: string | null;
  sourceFolderLabel: string | null;
  batchName: string;
  path: string;
  status: "live" | "found";
  driveHref: string | null;
  modifiedTime: string | null;
  checkedAt: string | null;
  match: BatchMetaMatch;
  adCount: number;
  creativeCount: number;
  firstActiveDate: string | null;
  metrics: PerformanceMetrics;
  performanceScore: CreativePerformanceScore;
};

const PAGE_SIZE = 1000;
const INSIGHT_SELECT = "ad_id,adset_id,campaign_id,creative_id,date,spend,impressions,reach,clicks,link_clicks,outbound_clicks,purchases,purchase_value,engagement,video_3s_views,thruplays";

async function fetchAllPages<T>(query: SupabaseQuery) {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function applyDateRange<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(query: T, dateRange?: InsightDateRange) {
  let scopedQuery = query;
  if (dateRange?.since) scopedQuery = scopedQuery.gte("date", dateRange.since);
  if (dateRange?.until) scopedQuery = scopedQuery.lte("date", dateRange.until);
  return scopedQuery;
}

async function fetchInsightsByColumn(clientId: string, column: "ad_id" | "adset_id" | "campaign_id", ids: string[], dateRange?: InsightDateRange) {
  if (ids.length === 0) return [] as InsightRow[];

  const supabase = createSupabaseServiceRoleClient();
  return fetchAllPages<InsightRow>(
    applyDateRange(
      supabase
        .from("creative_insights_daily")
        .select(INSIGHT_SELECT)
        .eq("client_id", clientId)
        .in(column, ids),
      dateRange
    )
  );
}

async function fetchAdsByColumn(clientId: string, column: "id" | "adset_id" | "campaign_id", ids: string[]) {
  if (ids.length === 0) return [] as MetaAdRow[];

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("meta_ads")
    .select("id,campaign_id,adset_id,creative_id")
    .eq("client_id", clientId)
    .in(column, ids);

  if (error) throw new Error(error.message);
  return (data ?? []) as MetaAdRow[];
}

function groupByKey<T>(rows: T[], keySelector: (row: T) => string | null | undefined) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = keySelector(row);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}

function uniqueCount(values: Array<string | null | undefined>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function firstInsightDate(rows: InsightRow[]) {
  const dates = rows
    .map((row) => row.date)
    .filter((date): date is string => Boolean(date))
    .sort();

  return dates[0] ?? null;
}

function statusIsFound(item: BatchOverviewItem): item is BatchOverviewItem & { status: "live" | "found"; match: BatchMetaMatch } {
  return (item.status === "live" || item.status === "found") && Boolean(item.match);
}

export async function listFoundBatchPerformance(clientId: string, dateRange?: InsightDateRange): Promise<{
  batches: BatchPerformanceItem[];
  error: string | null;
}> {
  try {
    const overview = await getBatchOverview(clientId);
    const foundItems = overview.items.filter(statusIsFound);

    if (foundItems.length === 0) return { batches: [], error: overview.settings?.lastCheckError ?? null };

    const matchIds = {
      ad: Array.from(new Set(foundItems.filter((item) => item.match.type === "ad").map((item) => item.match.id))),
      adset: Array.from(new Set(foundItems.filter((item) => item.match.type === "adset").map((item) => item.match.id))),
      campaign: Array.from(new Set(foundItems.filter((item) => item.match.type === "campaign").map((item) => item.match.id)))
    };

    const [
      adInsights,
      adSetInsights,
      campaignInsights,
      adRows,
      adSetAdRows,
      campaignAdRows
    ] = await Promise.all([
      fetchInsightsByColumn(clientId, "ad_id", matchIds.ad, dateRange),
      fetchInsightsByColumn(clientId, "adset_id", matchIds.adset, dateRange),
      fetchInsightsByColumn(clientId, "campaign_id", matchIds.campaign, dateRange),
      fetchAdsByColumn(clientId, "id", matchIds.ad),
      fetchAdsByColumn(clientId, "adset_id", matchIds.adset),
      fetchAdsByColumn(clientId, "campaign_id", matchIds.campaign)
    ]);

    const insightsByAd = groupByKey(adInsights, (row) => row.ad_id);
    const insightsByAdSet = groupByKey(adSetInsights, (row) => row.adset_id);
    const insightsByCampaign = groupByKey(campaignInsights, (row) => row.campaign_id);
    const adsByAd = groupByKey(adRows, (row) => row.id);
    const adsByAdSet = groupByKey(adSetAdRows, (row) => row.adset_id);
    const adsByCampaign = groupByKey(campaignAdRows, (row) => row.campaign_id);

    const batches = foundItems
      .map((item) => {
        const match = item.match;
        const insights =
          match.type === "ad"
            ? insightsByAd.get(match.id) ?? []
            : match.type === "adset"
              ? insightsByAdSet.get(match.id) ?? []
              : insightsByCampaign.get(match.id) ?? [];
        const ads =
          match.type === "ad"
            ? adsByAd.get(match.id) ?? []
            : match.type === "adset"
              ? adsByAdSet.get(match.id) ?? []
              : adsByCampaign.get(match.id) ?? [];
        const metrics = insights.length > 0 ? aggregateInsightRows(insights) : emptyMetrics;
        const insightAdCount = uniqueCount(insights.map((row) => row.ad_id));
        const insightCreativeCount = uniqueCount(insights.map((row) => row.creative_id));
        const adCount = Math.max(ads.length, insightAdCount, match.type === "ad" ? 1 : 0);
        const creativeCount = Math.max(uniqueCount(ads.map((row) => row.creative_id)), insightCreativeCount);

        return {
          id: item.id,
          sourceFolderId: item.sourceFolderId,
          sourceFolderLabel: item.sourceFolderLabel,
          batchName: item.name,
          path: item.path,
          status: item.status,
          driveHref: item.webViewLink,
          modifiedTime: item.modifiedTime,
          checkedAt: item.checkedAt,
          match,
          adCount,
          creativeCount,
          firstActiveDate: firstInsightDate(insights),
          metrics,
          performanceScore: calculateCreativePerformanceScore(metrics)
        } satisfies BatchPerformanceItem;
      })
      .sort((left, right) => right.metrics.spend - left.metrics.spend || left.batchName.localeCompare(right.batchName, "de"));

    return { batches, error: overview.settings?.lastCheckError ?? null };
  } catch (error) {
    return { batches: [], error: error instanceof Error ? error.message : "Batch Performance konnte nicht geladen werden." };
  }
}
