import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import type { InsightDateRange } from "@/lib/date-filters";
import { displayLandingUrl, normalizeLandingUrl } from "@/lib/landingpage-utils";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { aggregateInsightRows, emptyMetrics, type PerformanceMetrics } from "@/lib/metrics";

type CreativeRow = {
  id: string;
  meta_creative_id: string;
  name: string | null;
  title: string | null;
  body: string | null;
  call_to_action_type: string | null;
  landing_url: string | null;
};

type AdRow = {
  id: string;
  creative_id: string | null;
  name: string | null;
};

type InsightRow = {
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
};

type AnalysisRow = {
  creative_id: string | null;
  target_audience_fit_score: number | string | null;
  brand_fit_score: number | string | null;
  clarity_score: number | string | null;
  cta_score: number | string | null;
  funnel_stage: string | null;
  created_at: string;
};

type LandingpageAnalysisRow = {
  normalized_url: string;
  status: string;
  primary_offer: string | null;
  target_audience: string | null;
  funnel_stage: string | null;
  ctas: unknown;
  value_props: unknown;
  proof_points: unknown;
  objections: unknown;
  keywords: unknown;
  product_categories: unknown;
  match_signals: unknown;
  summary: string | null;
  error_message: string | null;
  analyzed_at: string | null;
};

export type LandingpageSignal = "GOOD" | "WATCH" | "BLEED";

export type LandingpageListItem = {
  url: string;
  displayUrl: string;
  adCount: number;
  creativeCount: number;
  metrics: PerformanceMetrics;
  matchScore: number | null;
  matchSource: "landingpage" | "creative_ai" | "none";
  landingpageAnalysis: {
    status: string;
    primaryOffer: string | null;
    funnelStage: string | null;
    analyzedAt: string | null;
    errorMessage: string | null;
  } | null;
  bestAd: {
    name: string;
    creativeId: string;
    roas: number | null;
    spend: number;
  } | null;
  signal: LandingpageSignal;
};

type CreativeWithContext = {
  creative: CreativeRow;
  ads: AdRow[];
  insights: InsightRow[];
  metrics: PerformanceMetrics;
  matchScore: number | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayName(creative: CreativeRow) {
  return creative.name ?? creative.title ?? creative.meta_creative_id;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function analysisMatchScore(analysis?: AnalysisRow) {
  if (!analysis) return null;
  return average([
    toNumber(analysis.target_audience_fit_score),
    toNumber(analysis.brand_fit_score),
    toNumber(analysis.clarity_score),
    toNumber(analysis.cta_score)
  ].filter((value): value is number => value !== null));
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[^a-z0-9äöüß]+/gi, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
    )
  );
}

function overlapScore(sourceText: string, targetSignals: string[]) {
  const sourceTokens = tokenize(sourceText);
  const targetTokens = tokenize(targetSignals.join(" "));
  if (sourceTokens.length === 0 || targetTokens.length === 0) return null;
  const targetSet = new Set(targetTokens);
  const matches = sourceTokens.filter((token) => targetSet.has(token)).length;
  return Math.min(100, Math.round((matches / Math.min(sourceTokens.length, 18)) * 100));
}

function ctaIntent(value: string | null) {
  const normalized = value?.toLowerCase() ?? "";
  if (["shop", "buy", "order", "kaufen", "bestellen", "warenkorb"].some((term) => normalized.includes(term))) return "buy";
  if (["discover", "learn", "mehr", "entdecken", "ansehen"].some((term) => normalized.includes(term))) return "discover";
  if (["lead", "contact", "kontakt", "termin", "angebot"].some((term) => normalized.includes(term))) return "lead";
  return null;
}

function ctaMatchScore(creativeCta: string | null, pageCtas: string[]) {
  const creativeIntent = ctaIntent(creativeCta);
  if (!creativeIntent || pageCtas.length === 0) return null;
  const pageIntents = pageCtas.map(ctaIntent).filter(Boolean);
  if (pageIntents.includes(creativeIntent)) return 100;
  return 45;
}

function funnelMatchScore(creativeFunnel: string | null | undefined, pageFunnel: string | null | undefined) {
  if (!creativeFunnel || !pageFunnel) return null;
  if (creativeFunnel === pageFunnel) return 100;
  if ((creativeFunnel === "TOFU" && pageFunnel === "MOFU") || (creativeFunnel === "MOFU" && (pageFunnel === "TOFU" || pageFunnel === "BOFU")) || (creativeFunnel === "BOFU" && pageFunnel === "MOFU")) return 70;
  return 35;
}

function weightedAverage(parts: Array<{ value: number | null; weight: number }>) {
  const usable = parts.filter((part): part is { value: number; weight: number } => part.value !== null);
  const weightSum = usable.reduce((sum, part) => sum + part.weight, 0);
  if (weightSum === 0) return null;
  return usable.reduce((sum, part) => sum + part.value * part.weight, 0) / weightSum;
}

function landingpageMatchScore(creative: CreativeRow, creativeAnalysis: AnalysisRow | undefined, landingpageAnalysis: LandingpageAnalysisRow | undefined) {
  if (!landingpageAnalysis || landingpageAnalysis.status !== "completed") return analysisMatchScore(creativeAnalysis);

  const pageSignals = [
    landingpageAnalysis.primary_offer,
    landingpageAnalysis.target_audience,
    landingpageAnalysis.summary,
    ...stringArray(landingpageAnalysis.value_props),
    ...stringArray(landingpageAnalysis.proof_points),
    ...stringArray(landingpageAnalysis.objections),
    ...stringArray(landingpageAnalysis.keywords),
    ...stringArray(landingpageAnalysis.product_categories),
    ...stringArray(landingpageAnalysis.match_signals)
  ].filter((value): value is string => Boolean(value));
  const creativeText = [creative.name, creative.title, creative.body, creative.call_to_action_type].filter(Boolean).join(" ");

  return weightedAverage([
    { value: overlapScore(creativeText, pageSignals), weight: 0.45 },
    { value: ctaMatchScore(creative.call_to_action_type, stringArray(landingpageAnalysis.ctas)), weight: 0.2 },
    { value: funnelMatchScore(creativeAnalysis?.funnel_stage, landingpageAnalysis.funnel_stage), weight: 0.2 },
    { value: analysisMatchScore(creativeAnalysis), weight: 0.15 }
  ]);
}

function weightedMatchScore(items: CreativeWithContext[]) {
  let weightSum = 0;
  let scoreSum = 0;

  for (const item of items) {
    if (item.matchScore === null) continue;
    const weight = Math.max(item.ads.length, 1);
    weightSum += weight;
    scoreSum += item.matchScore * weight;
  }

  return weightSum > 0 ? scoreSum / weightSum : null;
}

function bestAd(items: CreativeWithContext[]) {
  const candidates = items
    .filter((item) => item.metrics.spend > 0)
    .sort((a, b) => {
      const roasDelta = (b.metrics.roas ?? -1) - (a.metrics.roas ?? -1);
      if (roasDelta !== 0) return roasDelta;
      return b.metrics.purchaseValue - a.metrics.purchaseValue;
    });
  const best = candidates[0] ?? items.sort((a, b) => b.metrics.spend - a.metrics.spend)[0];
  if (!best) return null;

  return {
    name: best.ads[0]?.name ?? displayName(best.creative),
    creativeId: best.creative.id,
    roas: best.metrics.roas,
    spend: best.metrics.spend
  };
}

function landingpageSignal(metrics: PerformanceMetrics, matchScore: number | null): LandingpageSignal {
  if (metrics.spend >= 100 && ((metrics.roas !== null && metrics.roas < 1) || (matchScore !== null && matchScore < 50))) return "BLEED";
  if (metrics.spend >= 50 && metrics.roas !== null && metrics.roas >= 2 && (matchScore === null || matchScore >= 70)) return "GOOD";
  return "WATCH";
}

async function listClientLandingpagesUncached(clientId: string, since?: string | null, until?: string | null): Promise<{ landingpages: LandingpageListItem[]; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let insightsQuery = supabase
      .from("creative_insights_daily")
      .select("creative_id,spend,impressions,reach,clicks,link_clicks,outbound_clicks,purchases,purchase_value,engagement,video_3s_views,thruplays")
      .eq("client_id", clientId);
    if (since) insightsQuery = insightsQuery.gte("date", since);
    if (until) insightsQuery = insightsQuery.lte("date", until);
    const [
      { data: creatives, error: creativesError },
      { data: ads, error: adsError },
      { data: insights, error: insightsError },
      { data: analyses, error: analysesError },
      { data: landingpageAnalyses, error: landingpageAnalysesError }
    ] = await Promise.all([
      supabase.from("creatives").select("id,meta_creative_id,name,title,body,call_to_action_type,landing_url").eq("client_id", clientId),
      supabase.from("meta_ads").select("id,creative_id,name").eq("client_id", clientId),
      insightsQuery,
      supabase
        .from("creative_ai_analyses")
        .select("creative_id,target_audience_fit_score,brand_fit_score,clarity_score,cta_score,funnel_stage,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("landingpage_analyses")
        .select("normalized_url,status,primary_offer,target_audience,funnel_stage,ctas,value_props,proof_points,objections,keywords,product_categories,match_signals,summary,error_message,analyzed_at")
        .eq("client_id", clientId)
    ]);

    const error = creativesError ?? adsError ?? insightsError ?? analysesError ?? landingpageAnalysesError;
    if (error) return { landingpages: [], error: error.message };

    const adsByCreative = new Map<string, AdRow[]>();
    for (const ad of (ads ?? []) as AdRow[]) {
      if (!ad.creative_id) continue;
      adsByCreative.set(ad.creative_id, [...(adsByCreative.get(ad.creative_id) ?? []), ad]);
    }

    const insightsByCreative = new Map<string, InsightRow[]>();
    for (const insight of (insights ?? []) as InsightRow[]) {
      if (!insight.creative_id) continue;
      insightsByCreative.set(insight.creative_id, [...(insightsByCreative.get(insight.creative_id) ?? []), insight]);
    }

    const latestAnalysisByCreative = new Map<string, AnalysisRow>();
    for (const analysis of (analyses ?? []) as AnalysisRow[]) {
      if (!analysis.creative_id || latestAnalysisByCreative.has(analysis.creative_id)) continue;
      latestAnalysisByCreative.set(analysis.creative_id, analysis);
    }

    const landingpageAnalysisByUrl = new Map<string, LandingpageAnalysisRow>();
    for (const analysis of (landingpageAnalyses ?? []) as LandingpageAnalysisRow[]) {
      landingpageAnalysisByUrl.set(analysis.normalized_url, analysis);
    }

    const groups = new Map<string, CreativeWithContext[]>();
    for (const creative of (creatives ?? []) as CreativeRow[]) {
      const url = normalizeLandingUrl(creative.landing_url);
      if (!url) continue;

      const creativeInsights = insightsByCreative.get(creative.id) ?? [];
      const creativeAnalysis = latestAnalysisByCreative.get(creative.id);
      const landingpageAnalysis = landingpageAnalysisByUrl.get(url);
      const item: CreativeWithContext = {
        creative,
        ads: adsByCreative.get(creative.id) ?? [],
        insights: creativeInsights,
        metrics: creativeInsights.length > 0 ? aggregateInsightRows(creativeInsights) : emptyMetrics,
        matchScore: landingpageMatchScore(creative, creativeAnalysis, landingpageAnalysis)
      };
      groups.set(url, [...(groups.get(url) ?? []), item]);
    }

    const landingpages = Array.from(groups.entries())
      .map(([url, items]) => {
        const allInsights = items.flatMap((item) => item.insights);
        const metrics = allInsights.length > 0 ? aggregateInsightRows(allInsights) : emptyMetrics;
        const matchScore = weightedMatchScore(items);
        const landingpageAnalysis = landingpageAnalysisByUrl.get(url);

        return {
          url,
          displayUrl: displayLandingUrl(url),
          adCount: items.reduce((sum, item) => sum + item.ads.length, 0),
          creativeCount: items.length,
          metrics,
          matchScore,
          matchSource: landingpageAnalysis?.status === "completed" ? "landingpage" : matchScore === null ? "none" : "creative_ai",
          landingpageAnalysis: landingpageAnalysis
            ? {
                status: landingpageAnalysis.status,
                primaryOffer: landingpageAnalysis.primary_offer,
                funnelStage: landingpageAnalysis.funnel_stage,
                analyzedAt: landingpageAnalysis.analyzed_at,
                errorMessage: landingpageAnalysis.error_message
              }
            : null,
          bestAd: bestAd(items),
          signal: landingpageSignal(metrics, matchScore)
        } satisfies LandingpageListItem;
      })
      .sort((a, b) => b.metrics.spend - a.metrics.spend);

    return { landingpages, error: null };
  } catch (error) {
    return { landingpages: [], error: error instanceof Error ? error.message : "Landingpages konnten nicht geladen werden." };
  }
}

const listClientLandingpagesCached = unstable_cache(
  listClientLandingpagesUncached,
  ["client-landingpages-v2"],
  { revalidate: 120, tags: [CACHE_TAGS.landingpages] }
);

export async function listClientLandingpages(clientId: string, dateRange?: InsightDateRange): Promise<{ landingpages: LandingpageListItem[]; error: string | null }> {
  return listClientLandingpagesCached(clientId, dateRange?.since ?? null, dateRange?.until ?? null);
}
