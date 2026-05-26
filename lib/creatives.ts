import "server-only";

import { unstable_cache } from "next/cache";
import { calculateCreativePerformanceScore, type CreativePerformanceScore } from "@/lib/creative-score";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { aggregateInsightRows, emptyMetrics, type PerformanceMetrics } from "@/lib/metrics";

type CreativeRow = {
  id: string;
  meta_creative_id: string;
  creative_type: string | null;
  name: string | null;
  title: string | null;
  body: string | null;
  call_to_action_type: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  video_url: string | null;
  video_embed_url: string | null;
  video_permalink_url: string | null;
  landing_url: string | null;
  updated_at: string;
};

type AdRow = {
  id: string;
  creative_id: string | null;
  meta_ad_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  raw: { created_time?: string } | null;
};

type InsightRow = {
  ad_id?: string | null;
  creative_id: string | null;
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
  date?: string;
};

type AnalysisRow = {
  creative_id: string | null;
  funnel_stage: string | null;
  created_at: string;
};

type SupabaseQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type CreativeListItem = {
  id: string;
  metaCreativeId: string;
  name: string;
  title: string | null;
  body: string | null;
  type: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
  videoUrl: string | null;
  videoEmbedUrl: string | null;
  videoPermalinkUrl: string | null;
  landingUrl: string | null;
  cta: string | null;
  funnelStage: string | null;
  hasAiAnalysis: boolean;
  adCount: number;
  status: string;
  firstActiveDate: string | null;
  metrics: PerformanceMetrics;
  performanceScore: CreativePerformanceScore;
};

export type CreativeDetail = CreativeListItem & {
  ads: Array<{
    id: string;
    metaAdId: string;
    name: string;
    status: string;
    effectiveStatus: string;
  }>;
  dailyInsights: InsightRow[];
};

export type CreativeInsightDateRange = {
  since?: string | null;
  until?: string | null;
};

const INSIGHT_SELECT = "ad_id,creative_id,date,spend,impressions,reach,clicks,link_clicks,outbound_clicks,purchases,purchase_value,engagement,video_3s_views,thruplays";
const FIRST_ACTIVE_INSIGHT_SELECT = "ad_id,creative_id,date,spend,impressions";
const PAGE_SIZE = 1000;

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

function applyInsightDateRange<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(query: T, dateRange?: CreativeInsightDateRange) {
  let scopedQuery = query;
  if (dateRange?.since) scopedQuery = scopedQuery.gte("date", dateRange.since);
  if (dateRange?.until) scopedQuery = scopedQuery.lte("date", dateRange.until);
  return scopedQuery;
}

function displayName(creative: CreativeRow) {
  return creative.name ?? creative.title ?? creative.meta_creative_id;
}

function adDisplayName(ad: AdRow) {
  return ad.name ?? ad.meta_ad_id;
}

function displayNameFromAds(creative: CreativeRow, ads: AdRow[], insights: InsightRow[]) {
  if (ads.length === 0) return displayName(creative);

  const performanceByAd = new Map<string, number>();
  for (const insight of insights) {
    if (!insight.ad_id) continue;
    performanceByAd.set(insight.ad_id, (performanceByAd.get(insight.ad_id) ?? 0) + numberValue(insight.spend) + numberValue(insight.impressions) / 1000);
  }

  const sortedAds = [...ads].sort((a, b) => {
    const statusScore = (ad: AdRow) => (ad.effective_status === "ACTIVE" || ad.status === "ACTIVE" ? 2 : ad.effective_status === "PAUSED" || ad.status === "PAUSED" ? 1 : 0);
    const statusDelta = statusScore(b) - statusScore(a);
    if (statusDelta !== 0) return statusDelta;
    return (performanceByAd.get(b.id) ?? 0) - (performanceByAd.get(a.id) ?? 0);
  });

  return adDisplayName(sortedAds[0]);
}

function statusFromAds(ads: AdRow[]) {
  if (ads.some((ad) => ad.effective_status === "ACTIVE" || ad.status === "ACTIVE")) return "ACTIVE";
  if (ads.some((ad) => ad.effective_status === "PAUSED" || ad.status === "PAUSED")) return "PAUSED";
  return ads[0]?.effective_status ?? ads[0]?.status ?? "UNKNOWN";
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstActiveDate(ads: AdRow[], insights: InsightRow[]) {
  const deliveredDates = insights
    .filter((insight) => insight.date && (numberValue(insight.impressions) > 0 || numberValue(insight.spend) > 0))
    .map((insight) => insight.date as string)
    .sort();

  if (deliveredDates[0]) return deliveredDates[0];

  const createdDates = ads
    .map((ad) => ad.raw?.created_time?.slice(0, 10) ?? null)
    .filter((date): date is string => Boolean(date))
    .sort();

  return createdDates[0] ?? null;
}

function mapCreative(creative: CreativeRow, ads: AdRow[], insights: InsightRow[], analysis?: AnalysisRow, firstActiveInsights = insights): CreativeListItem {
  const metrics = insights.length > 0 ? aggregateInsightRows(insights) : emptyMetrics;

  return {
    id: creative.id,
    metaCreativeId: creative.meta_creative_id,
    name: displayNameFromAds(creative, ads, insights),
    title: creative.title,
    body: creative.body,
    type: creative.creative_type ?? "unknown",
    imageUrl: creative.image_url,
    thumbnailUrl: creative.thumbnail_url,
    videoId: creative.video_id,
    videoUrl: creative.video_url,
    videoEmbedUrl: creative.video_embed_url,
    videoPermalinkUrl: creative.video_permalink_url,
    landingUrl: creative.landing_url,
    cta: creative.call_to_action_type,
    funnelStage: analysis?.funnel_stage ?? null,
    hasAiAnalysis: Boolean(analysis),
    adCount: ads.length,
    status: statusFromAds(ads),
    firstActiveDate: firstActiveDate(ads, firstActiveInsights),
    metrics,
    performanceScore: calculateCreativePerformanceScore(metrics)
  };
}

async function listClientCreativesUncached(clientId: string, since?: string | null, until?: string | null): Promise<{ creatives: CreativeListItem[]; error: string | null }> {
  const dateRange = { since, until };

  try {
    const supabase = createSupabaseServiceRoleClient();
    const [
      { data: creatives, error: creativesError },
      { data: ads, error: adsError },
      insights,
      firstActiveInsights,
      { data: analyses, error: analysesError }
    ] = await Promise.all([
      supabase
        .from("creatives")
        .select("id,meta_creative_id,creative_type,name,title,body,call_to_action_type,image_url,thumbnail_url,video_id,video_url,video_embed_url,video_permalink_url,landing_url,updated_at")
        .eq("client_id", clientId)
        .order("updated_at", { ascending: false }),
      supabase.from("meta_ads").select("id,creative_id,meta_ad_id,name,status,effective_status,raw").eq("client_id", clientId),
      fetchAllPages<InsightRow>(
        applyInsightDateRange(
          supabase
            .from("creative_insights_daily")
            .select(INSIGHT_SELECT)
            .eq("client_id", clientId),
          dateRange
        )
      ),
      fetchAllPages<InsightRow>(
        supabase
          .from("creative_insights_daily")
          .select(FIRST_ACTIVE_INSIGHT_SELECT)
          .eq("client_id", clientId)
      ),
      supabase
        .from("creative_ai_analyses")
        .select("creative_id,funnel_stage,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
    ]);

    const error = creativesError ?? adsError ?? analysesError;
    if (error) return { creatives: [], error: error.message };

    const adsByCreative = new Map<string, AdRow[]>();
    for (const ad of (ads ?? []) as AdRow[]) {
      if (!ad.creative_id) continue;
      adsByCreative.set(ad.creative_id, [...(adsByCreative.get(ad.creative_id) ?? []), ad]);
    }

    const insightsByCreative = new Map<string, InsightRow[]>();
    for (const insight of insights) {
      if (!insight.creative_id) continue;
      insightsByCreative.set(insight.creative_id, [...(insightsByCreative.get(insight.creative_id) ?? []), insight]);
    }

    const firstActiveInsightsByCreative = new Map<string, InsightRow[]>();
    for (const insight of firstActiveInsights) {
      if (!insight.creative_id) continue;
      firstActiveInsightsByCreative.set(insight.creative_id, [...(firstActiveInsightsByCreative.get(insight.creative_id) ?? []), insight]);
    }

    const latestAnalysisByCreative = new Map<string, AnalysisRow>();
    for (const analysis of (analyses ?? []) as AnalysisRow[]) {
      if (!analysis.creative_id || latestAnalysisByCreative.has(analysis.creative_id)) continue;
      latestAnalysisByCreative.set(analysis.creative_id, analysis);
    }

    const mapped = ((creatives ?? []) as CreativeRow[])
      .map((creative) => {
        return mapCreative(
          creative,
          adsByCreative.get(creative.id) ?? [],
          insightsByCreative.get(creative.id) ?? [],
          latestAnalysisByCreative.get(creative.id),
          firstActiveInsightsByCreative.get(creative.id) ?? []
        );
      })
      .sort((a, b) => b.metrics.spend - a.metrics.spend);

    return { creatives: mapped, error: null };
  } catch (error) {
    return { creatives: [], error: error instanceof Error ? error.message : "Creatives konnten nicht geladen werden." };
  }
}

const listClientCreativesCached = unstable_cache(
  listClientCreativesUncached,
  ["list-client-creatives-v2"],
  { revalidate: 120 }
);

export async function listClientCreatives(clientId: string, dateRange?: CreativeInsightDateRange): Promise<{ creatives: CreativeListItem[]; error: string | null }> {
  return listClientCreativesCached(clientId, dateRange?.since ?? null, dateRange?.until ?? null);
}

export async function getClientCreativeDetail(clientId: string, creativeId: string, dateRange?: CreativeInsightDateRange): Promise<{ creative: CreativeDetail | null; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: creative, error: creativeError } = await supabase
      .from("creatives")
      .select("id,meta_creative_id,creative_type,name,title,body,call_to_action_type,image_url,thumbnail_url,video_id,video_url,video_embed_url,video_permalink_url,landing_url,updated_at")
      .eq("client_id", clientId)
      .eq("id", creativeId)
      .single();

    if (creativeError) return { creative: null, error: creativeError.message };

    const [{ data: ads, error: adsError }, insights, firstActiveInsights] = await Promise.all([
      supabase.from("meta_ads").select("id,creative_id,meta_ad_id,name,status,effective_status,raw").eq("creative_id", creativeId),
      fetchAllPages<InsightRow>(
        applyInsightDateRange(
          supabase
            .from("creative_insights_daily")
            .select(INSIGHT_SELECT)
            .eq("creative_id", creativeId)
            .order("date", { ascending: false }),
          dateRange
        )
      ),
      fetchAllPages<InsightRow>(
        supabase
          .from("creative_insights_daily")
          .select(FIRST_ACTIVE_INSIGHT_SELECT)
          .eq("creative_id", creativeId)
          .order("date", { ascending: false })
      )
    ]);

    const error = adsError;
    if (error) return { creative: null, error: error.message };

    const listItem = mapCreative(creative as CreativeRow, (ads ?? []) as AdRow[], insights, undefined, firstActiveInsights);
    return {
      creative: {
        ...listItem,
        ads: ((ads ?? []) as AdRow[]).map((ad) => ({
          id: ad.id,
          metaAdId: ad.meta_ad_id,
          name: adDisplayName(ad),
          status: ad.status ?? "UNKNOWN",
          effectiveStatus: ad.effective_status ?? "UNKNOWN"
        })),
        dailyInsights: insights
      },
      error: null
    };
  } catch (error) {
    return { creative: null, error: error instanceof Error ? error.message : "Creative konnte nicht geladen werden." };
  }
}
