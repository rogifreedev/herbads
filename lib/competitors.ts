import "server-only";

import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

type CompetitorRow = {
  id: string;
  client_id: string;
  name: string;
  website_url: string | null;
  meta_page_id: string | null;
  meta_ad_library_url: string | null;
  notes: string | null;
  created_at: string;
};

type SourceRow = {
  id: string;
  client_id: string;
  competitor_id: string | null;
  url: string;
  status: string;
  error_message: string | null;
  last_checked_at: string | null;
  created_at: string;
};

type CreativeRow = {
  id: string;
  client_id: string;
  competitor_id: string | null;
  source_id: string | null;
  source_url: string | null;
  ad_library_id: string | null;
  status: string;
  format: string;
  platforms: unknown;
  started_at: string | null;
  ended_at: string | null;
  active_days: number | null;
  reach_min: number | null;
  reach_max: number | null;
  reach_estimate: number | null;
  estimated_cpm: number | string | null;
  estimated_spend: number | string | null;
  estimated_daily_spend: number | string | null;
  estimate_confidence: string;
  thumbnail_url: string | null;
  video_url: string | null;
  image_url: string | null;
  landing_url: string | null;
  primary_text: string | null;
  headline: string | null;
  hook: string | null;
  cta: string | null;
  created_at: string;
};

type AnalysisRow = {
  id: string;
  competitor_creative_id: string;
  model: string;
  status: string;
  hook: string | null;
  hook_explanation: string | null;
  body: string | null;
  ending: string | null;
  visual_elements: JsonRecord | null;
  detected_text: string | null;
  offer: string | null;
  angle: string | null;
  funnel_stage: string | null;
  emotion_scores: JsonRecord | null;
  strengths: unknown;
  weaknesses: unknown;
  hypotheses: unknown;
  adaptation_ideas: unknown;
  ranking_score: number | string | null;
  raw: JsonRecord | null;
  created_at: string;
};

type InsightRow = {
  spend: number | string | null;
  impressions: number | null;
};

type ProfileRow = {
  competitors: string | null;
};

type KnowledgeChunkRow = {
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
};

type MetaAdArchiveResponse = {
  data?: MetaAdArchiveItem[];
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

type MetaRange = {
  lower_bound?: string | number;
  upper_bound?: string | number;
};

type MetaAdArchiveItem = {
  id?: string;
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  impressions?: MetaRange;
  spend?: MetaRange;
};

type GeneratedAnalysis = {
  hook: string;
  hookExplanation: string;
  body: string;
  ending: string;
  visualElements: JsonRecord;
  detectedText: string;
  offer: string;
  angle: string;
  funnelStage: string | null;
  emotionScores: JsonRecord;
  strengths: string[];
  weaknesses: string[];
  hypotheses: string[];
  adaptationIdeas: string[];
  rankingScore: number | null;
};

export type Competitor = {
  id: string;
  name: string;
  websiteUrl: string | null;
  metaPageId: string | null;
  metaAdLibraryUrl: string | null;
  notes: string | null;
  createdAt: string;
};

export type CompetitorSource = {
  id: string;
  competitorId: string | null;
  url: string;
  status: string;
  errorMessage: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
};

export type CompetitorCreativeAnalysis = {
  id: string;
  model: string;
  status: string;
  hook: string | null;
  hookExplanation: string | null;
  body: string | null;
  ending: string | null;
  visualElements: JsonRecord;
  detectedText: string | null;
  offer: string | null;
  angle: string | null;
  funnelStage: string | null;
  emotionScores: JsonRecord;
  strengths: string[];
  weaknesses: string[];
  hypotheses: string[];
  adaptationIdeas: string[];
  rankingScore: number | null;
  createdAt: string;
};

export type CompetitorCreative = {
  id: string;
  competitorId: string | null;
  competitorName: string;
  sourceId: string | null;
  sourceUrl: string | null;
  adLibraryId: string | null;
  status: string;
  format: string;
  platforms: string[];
  startedAt: string | null;
  endedAt: string | null;
  activeDays: number | null;
  reachMin: number | null;
  reachMax: number | null;
  reachEstimate: number | null;
  estimatedCpm: number | null;
  estimatedSpend: number | null;
  estimatedDailySpend: number | null;
  estimateConfidence: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  landingUrl: string | null;
  primaryText: string | null;
  headline: string | null;
  hook: string | null;
  cta: string | null;
  rankingScore: number;
  analysis: CompetitorCreativeAnalysis | null;
  createdAt: string;
};

export type DetectedCompetitorLink = {
  url: string;
  source: "profile" | "knowledge";
};

export type CompetitorOverview = {
  competitors: Competitor[];
  sources: CompetitorSource[];
  creatives: CompetitorCreative[];
  detectedLinks: DetectedCompetitorLink[];
  ownCpm: number;
  ownCpmConfidence: "high" | "medium" | "low";
  totals: {
    competitors: number;
    creatives: number;
    analyzedCreatives: number;
    estimatedSpend: number;
  };
  error: string | null;
};

export type CreateCompetitorInput = {
  name: string;
  websiteUrl?: string | null;
  metaPageId?: string | null;
  metaAdLibraryUrl?: string | null;
  notes?: string | null;
};

export type CreateCompetitorCreativeInput = {
  competitorId?: string | null;
  sourceUrl?: string | null;
  adLibraryId?: string | null;
  status?: string | null;
  format?: string | null;
  platforms?: string[];
  startedAt?: string | null;
  endedAt?: string | null;
  reachMin?: number | null;
  reachMax?: number | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  landingUrl?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  hook?: string | null;
  cta?: string | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const valueString = stringValue(value);
  return valueString || null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function clampScore(value: unknown) {
  const score = nullableNumber(value);
  if (score === null) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeFormat(value: unknown) {
  const format = stringValue(value).toLowerCase();
  if (["reel", "video", "static", "image", "carousel"].includes(format)) return format === "image" ? "static" : format;
  return "unknown";
}

function normalizeFunnel(value: unknown) {
  const funnel = stringValue(value).toUpperCase();
  if (funnel === "TOFU" || funnel === "MOFU" || funnel === "BOFU") return funnel;
  return null;
}

function extractAdLibraryUrls(value: string | null | undefined, source: DetectedCompetitorLink["source"]) {
  if (!value) return [];
  const matches = value.match(/https?:\/\/[^\s)\]"']*facebook\.com\/ads\/library[^\s)\]"']*/gi) ?? [];
  return matches.map((url) => ({ url, source }));
}

function activeDays(startedAt: string | null | undefined, endedAt: string | null | undefined) {
  if (!startedAt) return null;
  const start = new Date(`${startedAt}T00:00:00Z`);
  const end = endedAt ? new Date(`${endedAt}T00:00:00Z`) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

function estimateReach(reachMin?: number | null, reachMax?: number | null) {
  if (reachMin !== null && reachMin !== undefined && reachMax !== null && reachMax !== undefined) return Math.round((reachMin + reachMax) / 2);
  return reachMin ?? reachMax ?? null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function rangeBounds(range: MetaRange | undefined) {
  if (!range) return { min: null, max: null };
  return {
    min: nullableNumber(range.lower_bound),
    max: nullableNumber(range.upper_bound)
  };
}

function parseAdLibraryUrl(value: string) {
  try {
    const url = new URL(value);
    return {
      pageId: url.searchParams.get("view_all_page_id") ?? url.searchParams.get("page_id"),
      adId: url.searchParams.get("id") ?? url.searchParams.get("ad_id") ?? url.searchParams.get("ad_archive_id")
    };
  } catch {
    return { pageId: null, adId: null };
  }
}

function adLibraryCountries() {
  return getOptionalEnv("COMPETITOR_AD_LIBRARY_COUNTRIES", "DE,AT,IT,CH")
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
}

function firstString(values: string[] | undefined) {
  return values?.map((value) => value.trim()).find(Boolean) ?? null;
}

function metaAdLibraryAccessToken() {
  return getOptionalEnv("META_AD_LIBRARY_ACCESS_TOKEN") || getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN");
}

function metaAdArchiveErrorMessage(error?: MetaAdArchiveResponse["error"]) {
  const message = error?.message ?? "Meta Ad Library Crawl fehlgeschlagen.";
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("permission") || lowerMessage.includes("permissions")) {
    return "Meta blockiert den Ad Library Crawl: Die Meta App bzw. der verwendete Token hat keine Berechtigung fuer /ads_archive. Hinterlege einen Token mit Meta Ad Library API Zugriff als META_AD_LIBRARY_ACCESS_TOKEN oder ergaenze das Creative manuell ueber Advanced.";
  }
  return message;
}

function estimateConfidence(input: { reachEstimate: number | null; activeDays: number | null; ownCpmConfidence: string }) {
  if (input.reachEstimate && input.activeDays && input.ownCpmConfidence === "high") return "high";
  if (input.reachEstimate && input.ownCpmConfidence !== "low") return "medium";
  return "low";
}

function estimateCreativeMetrics(input: { reachMin?: number | null; reachMax?: number | null; startedAt?: string | null; endedAt?: string | null; cpm: number; cpmConfidence: "high" | "medium" | "low" }) {
  const reachEstimate = estimateReach(input.reachMin, input.reachMax);
  const days = activeDays(input.startedAt, input.endedAt);
  const estimatedSpend = reachEstimate === null ? null : (reachEstimate / 1000) * input.cpm;
  return {
    activeDays: days,
    reachEstimate,
    estimatedCpm: input.cpm,
    estimatedSpend,
    estimatedDailySpend: estimatedSpend !== null && days ? estimatedSpend / days : null,
    estimateConfidence: estimateConfidence({ reachEstimate, activeDays: days, ownCpmConfidence: input.cpmConfidence })
  };
}

function scoreHigher(value: number | null, target: number) {
  if (value === null || target <= 0) return 0;
  return Math.max(0, Math.min(100, (value / target) * 100));
}

function scoreCreative(creative: CreativeRow, analysis?: AnalysisRow | null) {
  const reachVelocity = creative.reach_estimate && creative.active_days ? creative.reach_estimate / creative.active_days : null;
  const velocityScore = scoreHigher(reachVelocity, 5000);
  const spendScore = scoreHigher(nullableNumber(creative.estimated_spend), 1000);
  const analysisScore = nullableNumber(analysis?.ranking_score);
  return Math.round((velocityScore * 0.35) + (spendScore * 0.3) + ((analysisScore ?? 50) * 0.35));
}

function mapCompetitor(row: CompetitorRow): Competitor {
  return {
    id: row.id,
    name: row.name,
    websiteUrl: row.website_url,
    metaPageId: row.meta_page_id,
    metaAdLibraryUrl: row.meta_ad_library_url,
    notes: row.notes,
    createdAt: row.created_at
  };
}

function mapSource(row: SourceRow): CompetitorSource {
  return {
    id: row.id,
    competitorId: row.competitor_id,
    url: row.url,
    status: row.status,
    errorMessage: row.error_message,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at
  };
}

function mapAnalysis(row: AnalysisRow | null | undefined): CompetitorCreativeAnalysis | null {
  if (!row) return null;
  return {
    id: row.id,
    model: row.model,
    status: row.status,
    hook: row.hook,
    hookExplanation: row.hook_explanation,
    body: row.body,
    ending: row.ending,
    visualElements: row.visual_elements ?? {},
    detectedText: row.detected_text,
    offer: row.offer,
    angle: row.angle,
    funnelStage: row.funnel_stage,
    emotionScores: row.emotion_scores ?? {},
    strengths: stringArray(row.strengths),
    weaknesses: stringArray(row.weaknesses),
    hypotheses: stringArray(row.hypotheses),
    adaptationIdeas: stringArray(row.adaptation_ideas),
    rankingScore: nullableNumber(row.ranking_score),
    createdAt: row.created_at
  };
}

function mapCreative(row: CreativeRow, competitorsById: Map<string, CompetitorRow>, analysis?: AnalysisRow | null): CompetitorCreative {
  return {
    id: row.id,
    competitorId: row.competitor_id,
    competitorName: row.competitor_id ? competitorsById.get(row.competitor_id)?.name ?? "Unbekannter Competitor" : "Ohne Competitor",
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    adLibraryId: row.ad_library_id,
    status: row.status,
    format: row.format,
    platforms: stringArray(row.platforms),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    activeDays: row.active_days,
    reachMin: row.reach_min,
    reachMax: row.reach_max,
    reachEstimate: row.reach_estimate,
    estimatedCpm: nullableNumber(row.estimated_cpm),
    estimatedSpend: nullableNumber(row.estimated_spend),
    estimatedDailySpend: nullableNumber(row.estimated_daily_spend),
    estimateConfidence: row.estimate_confidence,
    thumbnailUrl: row.thumbnail_url,
    videoUrl: row.video_url,
    imageUrl: row.image_url,
    landingUrl: row.landing_url,
    primaryText: row.primary_text,
    headline: row.headline,
    hook: row.hook,
    cta: row.cta,
    rankingScore: scoreCreative(row, analysis),
    analysis: mapAnalysis(analysis),
    createdAt: row.created_at
  };
}

async function ownCpm(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("creative_insights_daily")
    .select("spend,impressions")
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as InsightRow[];
  const spend = rows.reduce((sum, row) => sum + numberValue(row.spend), 0);
  const impressions = rows.reduce((sum, row) => sum + numberValue(row.impressions), 0);
  if (impressions >= 10000 && spend > 0) return { cpm: (spend / impressions) * 1000, confidence: "high" as const };
  if (impressions >= 1000 && spend > 0) return { cpm: (spend / impressions) * 1000, confidence: "medium" as const };
  return { cpm: Number(getOptionalEnv("COMPETITOR_DEFAULT_CPM", "12")), confidence: "low" as const };
}

async function detectedLinks(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: profile }, { data: chunks }] = await Promise.all([
    supabase.from("client_profiles").select("competitors").eq("client_id", clientId).maybeSingle(),
    supabase.from("client_knowledge_chunks").select("content").eq("client_id", clientId).limit(100)
  ]);

  const links = [
    ...extractAdLibraryUrls((profile as ProfileRow | null)?.competitors, "profile"),
    ...((chunks ?? []) as KnowledgeChunkRow[]).flatMap((chunk) => extractAdLibraryUrls(chunk.content, "knowledge"))
  ];
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

async function latestAnalyses(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("competitor_creative_analyses")
    .select("id,competitor_creative_id,model,status,hook,hook_explanation,body,ending,visual_elements,detected_text,offer,angle,funnel_stage,emotion_scores,strengths,weaknesses,hypotheses,adaptation_ideas,ranking_score,raw,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const map = new Map<string, AnalysisRow>();
  for (const row of (data ?? []) as AnalysisRow[]) {
    if (map.has(row.competitor_creative_id)) continue;
    map.set(row.competitor_creative_id, row);
  }
  return map;
}

export async function getCompetitorOverview(clientId: string): Promise<CompetitorOverview> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [{ data: competitors, error: competitorsError }, { data: sources, error: sourcesError }, { data: creatives, error: creativesError }, cpmBase, links, analyses] = await Promise.all([
      supabase.from("competitors").select("id,client_id,name,website_url,meta_page_id,meta_ad_library_url,notes,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("competitor_ad_library_sources").select("id,client_id,competitor_id,url,status,error_message,last_checked_at,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("competitor_creatives").select("id,client_id,competitor_id,source_id,source_url,ad_library_id,status,format,platforms,started_at,ended_at,active_days,reach_min,reach_max,reach_estimate,estimated_cpm,estimated_spend,estimated_daily_spend,estimate_confidence,thumbnail_url,video_url,image_url,landing_url,primary_text,headline,hook,cta,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
      ownCpm(clientId),
      detectedLinks(clientId),
      latestAnalyses(clientId)
    ]);

    const error = competitorsError ?? sourcesError ?? creativesError;
    if (error) throw new Error(error.message);

    const competitorRows = (competitors ?? []) as CompetitorRow[];
    const competitorsById = new Map(competitorRows.map((competitor) => [competitor.id, competitor]));
    const mappedCreatives = ((creatives ?? []) as CreativeRow[])
      .map((creative) => mapCreative(creative, competitorsById, analyses.get(creative.id)))
      .sort((a, b) => b.rankingScore - a.rankingScore || (b.estimatedSpend ?? 0) - (a.estimatedSpend ?? 0));

    return {
      competitors: competitorRows.map(mapCompetitor),
      sources: ((sources ?? []) as SourceRow[]).map(mapSource),
      creatives: mappedCreatives,
      detectedLinks: links,
      ownCpm: cpmBase.cpm,
      ownCpmConfidence: cpmBase.confidence,
      totals: {
        competitors: competitorRows.length,
        creatives: mappedCreatives.length,
        analyzedCreatives: mappedCreatives.filter((creative) => creative.analysis).length,
        estimatedSpend: mappedCreatives.reduce((sum, creative) => sum + (creative.estimatedSpend ?? 0), 0)
      },
      error: null
    };
  } catch (error) {
    return {
      competitors: [],
      sources: [],
      creatives: [],
      detectedLinks: [],
      ownCpm: Number(getOptionalEnv("COMPETITOR_DEFAULT_CPM", "12")),
      ownCpmConfidence: "low",
      totals: { competitors: 0, creatives: 0, analyzedCreatives: 0, estimatedSpend: 0 },
      error: error instanceof Error ? error.message : "Competitor Intelligence konnte nicht geladen werden."
    };
  }
}

export async function createCompetitor(clientId: string, input: CreateCompetitorInput) {
  const name = nullableString(input.name);
  if (!name) throw new Error("Competitor Name fehlt.");
  const supabase = createSupabaseServiceRoleClient();
  const metaAdLibraryUrl = nullableString(input.metaAdLibraryUrl);
  const { data: competitor, error } = await supabase.from("competitors").insert({
    client_id: clientId,
    name,
    website_url: nullableString(input.websiteUrl),
    meta_page_id: nullableString(input.metaPageId),
    meta_ad_library_url: metaAdLibraryUrl,
    notes: nullableString(input.notes)
  }).select("id").single();
  if (error) throw new Error(error.message);

  if (metaAdLibraryUrl && competitor?.id) {
    const { error: sourceError } = await supabase.from("competitor_ad_library_sources").insert({
      client_id: clientId,
      competitor_id: competitor.id,
      url: metaAdLibraryUrl,
      status: "pending"
    });
    if (sourceError) throw new Error(sourceError.message);
  }

  return getCompetitorOverview(clientId);
}

export async function createCompetitorSource(clientId: string, input: { competitorId?: string | null; url: string }) {
  const url = nullableString(input.url);
  if (!url) throw new Error("Ad Library URL fehlt.");
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("competitor_ad_library_sources").insert({
    client_id: clientId,
    competitor_id: nullableString(input.competitorId),
    url,
    status: "pending"
  });
  if (error) throw new Error(error.message);
  return getCompetitorOverview(clientId);
}

async function fetchAdArchiveByPage(pageId: string) {
  const token = metaAdLibraryAccessToken();
  if (!token) throw new Error("META_AD_LIBRARY_ACCESS_TOKEN oder META_SYSTEM_USER_ACCESS_TOKEN fehlt.");
  const apiVersion = getOptionalEnv("META_API_VERSION", "v20.0");
  const limit = Math.max(1, Math.min(100, Number(getOptionalEnv("COMPETITOR_CRAWL_LIMIT", "25")) || 25));
  const fields = [
    "id",
    "ad_snapshot_url",
    "ad_delivery_start_time",
    "ad_delivery_stop_time",
    "ad_creative_bodies",
    "ad_creative_link_titles",
    "ad_creative_link_captions",
    "ad_creative_link_descriptions",
    "page_id",
    "page_name",
    "publisher_platforms",
    "impressions",
    "spend"
  ].join(",");
  const params = new URLSearchParams({
    access_token: token,
    ad_type: "ALL",
    ad_active_status: "ALL",
    ad_reached_countries: JSON.stringify(adLibraryCountries()),
    search_page_ids: JSON.stringify([pageId]),
    fields,
    limit: String(limit)
  });
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/ads_archive?${params.toString()}`, { cache: "no-store" });
  const payload = (await response.json()) as MetaAdArchiveResponse;
  if (!response.ok || payload.error) throw new Error(metaAdArchiveErrorMessage(payload.error));
  return payload.data ?? [];
}

async function upsertArchiveItem(clientId: string, source: SourceRow, item: MetaAdArchiveItem, cpmBase: Awaited<ReturnType<typeof ownCpm>>) {
  if (!item.id) return false;
  const supabase = createSupabaseServiceRoleClient();
  const reach = rangeBounds(item.impressions);
  const startedAt = parseDate(item.ad_delivery_start_time);
  const endedAt = parseDate(item.ad_delivery_stop_time);
  const estimates = estimateCreativeMetrics({
    reachMin: reach.min,
    reachMax: reach.max,
    startedAt,
    endedAt,
    cpm: cpmBase.cpm,
    cpmConfidence: cpmBase.confidence
  });
  const primaryText = firstString(item.ad_creative_bodies);
  const headline = firstString(item.ad_creative_link_titles) ?? firstString(item.ad_creative_link_captions);
  const existing = await supabase
    .from("competitor_creatives")
    .select("id")
    .eq("client_id", clientId)
    .eq("ad_library_id", item.id)
    .maybeSingle();
  const payload = {
    client_id: clientId,
    competitor_id: source.competitor_id,
    source_id: source.id,
    source_url: item.ad_snapshot_url ?? source.url,
    ad_library_id: item.id,
    status: endedAt ? "inactive" : "active",
    format: "unknown",
    platforms: item.publisher_platforms ?? [],
    started_at: startedAt,
    ended_at: endedAt,
    active_days: estimates.activeDays,
    reach_min: reach.min,
    reach_max: reach.max,
    reach_estimate: estimates.reachEstimate,
    estimated_cpm: estimates.estimatedCpm,
    estimated_spend: estimates.estimatedSpend,
    estimated_daily_spend: estimates.estimatedDailySpend,
    estimate_confidence: estimates.estimateConfidence,
    primary_text: primaryText,
    headline,
    hook: primaryText?.split(/(?<=[.!?])\s+/)[0]?.slice(0, 160) ?? headline,
    raw: item as unknown as JsonRecord
  };

  if (existing.data?.id) {
    const { error } = await supabase.from("competitor_creatives").update(payload).eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return true;
  }

  const { error } = await supabase.from("competitor_creatives").insert(payload);
  if (error) throw new Error(error.message);
  return true;
}

async function createPlaceholderFromAdId(clientId: string, source: SourceRow, adId: string, cpmBase: Awaited<ReturnType<typeof ownCpm>>) {
  const supabase = createSupabaseServiceRoleClient();
  const existing = await supabase
    .from("competitor_creatives")
    .select("id")
    .eq("client_id", clientId)
    .eq("ad_library_id", adId)
    .maybeSingle();
  if (existing.data?.id) return false;

  const { error } = await supabase.from("competitor_creatives").insert({
    client_id: clientId,
    competitor_id: source.competitor_id,
    source_id: source.id,
    source_url: source.url,
    ad_library_id: adId,
    status: "pending_manual_enrichment",
    format: "unknown",
    estimated_cpm: cpmBase.cpm,
    estimate_confidence: "low",
    raw: { source: "ad_library_url_placeholder" }
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function crawlCompetitorSource(clientId: string, sourceId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: source, error: sourceError } = await supabase
    .from("competitor_ad_library_sources")
    .select("id,client_id,competitor_id,url,status,error_message,last_checked_at,created_at")
    .eq("client_id", clientId)
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) throw new Error(sourceError?.message ?? "Competitor Source wurde nicht gefunden.");

  const typedSource = source as SourceRow;
  await supabase.from("competitor_ad_library_sources").update({ status: "running", error_message: null }).eq("id", sourceId);

  try {
    const cpmBase = await ownCpm(clientId);
    const parsed = parseAdLibraryUrl(typedSource.url);
    let pageId = parsed.pageId;
    if (!pageId && typedSource.competitor_id) {
      const { data: competitor } = await supabase.from("competitors").select("meta_page_id").eq("id", typedSource.competitor_id).maybeSingle();
      pageId = typeof competitor?.meta_page_id === "string" ? competitor.meta_page_id : null;
    }

    let imported = 0;
    if (pageId) {
      const items = await fetchAdArchiveByPage(pageId);
      for (const item of items) {
        if (await upsertArchiveItem(clientId, typedSource, item, cpmBase)) imported += 1;
      }
    }

    if (imported === 0 && parsed.adId) {
      imported += await createPlaceholderFromAdId(clientId, typedSource, parsed.adId, cpmBase) ? 1 : 0;
    }

    if (imported === 0) {
      throw new Error("Keine Ads importiert. Der Link enthaelt eventuell keine Page-ID, oder die Meta Ad Library API liefert fuer diese Source keine Daten. Nutze Advanced, um das Creative manuell zu ergaenzen.");
    }

    await supabase
      .from("competitor_ad_library_sources")
      .update({ status: "completed", error_message: null, last_checked_at: new Date().toISOString(), raw: { imported, pageId, adId: parsed.adId } })
      .eq("id", sourceId);
    return getCompetitorOverview(clientId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor Crawl fehlgeschlagen.";
    await supabase
      .from("competitor_ad_library_sources")
      .update({ status: "failed", error_message: message, last_checked_at: new Date().toISOString() })
      .eq("id", sourceId);
    throw new Error(message);
  }
}

export async function createCompetitorCreative(clientId: string, input: CreateCompetitorCreativeInput) {
  const cpmBase = await ownCpm(clientId);
  const estimates = estimateCreativeMetrics({
    reachMin: input.reachMin ?? null,
    reachMax: input.reachMax ?? null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
    cpm: cpmBase.cpm,
    cpmConfidence: cpmBase.confidence
  });
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("competitor_creatives").insert({
    client_id: clientId,
    competitor_id: nullableString(input.competitorId),
    source_url: nullableString(input.sourceUrl),
    ad_library_id: nullableString(input.adLibraryId),
    status: nullableString(input.status) ?? "active",
    format: normalizeFormat(input.format),
    platforms: input.platforms ?? [],
    started_at: nullableString(input.startedAt),
    ended_at: nullableString(input.endedAt),
    active_days: estimates.activeDays,
    reach_min: input.reachMin ?? null,
    reach_max: input.reachMax ?? null,
    reach_estimate: estimates.reachEstimate,
    estimated_cpm: estimates.estimatedCpm,
    estimated_spend: estimates.estimatedSpend,
    estimated_daily_spend: estimates.estimatedDailySpend,
    estimate_confidence: estimates.estimateConfidence,
    thumbnail_url: nullableString(input.thumbnailUrl),
    video_url: nullableString(input.videoUrl),
    image_url: nullableString(input.imageUrl),
    landing_url: nullableString(input.landingUrl),
    primary_text: nullableString(input.primaryText),
    headline: nullableString(input.headline),
    hook: nullableString(input.hook),
    cta: nullableString(input.cta)
  });
  if (error) throw new Error(error.message);
  return getCompetitorOverview(clientId);
}

function textFromContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => (item && typeof item === "object" && "text" in item ? String(item.text ?? "") : "")).join("\n");
  return "";
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("OpenRouter Antwort enthielt kein JSON Objekt.");
  return JSON.parse(candidate.slice(start, end + 1)) as JsonRecord;
}

function normalizeGeneratedAnalysis(payload: JsonRecord): GeneratedAnalysis {
  const visualElements = payload.visualElements && typeof payload.visualElements === "object" && !Array.isArray(payload.visualElements) ? (payload.visualElements as JsonRecord) : {};
  const emotionScores = payload.emotionScores && typeof payload.emotionScores === "object" && !Array.isArray(payload.emotionScores) ? (payload.emotionScores as JsonRecord) : {};
  return {
    hook: stringValue(payload.hook),
    hookExplanation: stringValue(payload.hookExplanation),
    body: stringValue(payload.body),
    ending: stringValue(payload.ending),
    visualElements,
    detectedText: stringValue(payload.detectedText),
    offer: stringValue(payload.offer),
    angle: stringValue(payload.angle),
    funnelStage: normalizeFunnel(payload.funnelStage),
    emotionScores,
    strengths: stringArray(payload.strengths),
    weaknesses: stringArray(payload.weaknesses),
    hypotheses: stringArray(payload.hypotheses),
    adaptationIdeas: stringArray(payload.adaptationIdeas),
    rankingScore: clampScore(payload.rankingScore)
  };
}

async function callOpenRouterForCompetitorAnalysis(prompt: string, imageUrl?: string | null) {
  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY fehlt.");
  const model = getOptionalEnv("OPENROUTER_VISION_MODEL", getOptionalEnv("OPENROUTER_TEXT_MODEL", "openai/gpt-5.2"));
  const content = imageUrl?.startsWith("http")
    ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl } }]
    : prompt;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": getOptionalEnv("OPENROUTER_HTTP_REFERER", getOptionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3001")),
      "X-OpenRouter-Title": getOptionalEnv("OPENROUTER_APP_TITLE", "Herb Ads"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Du bist ein Senior Performance Creative Strategist. Analysiere Competitor Meta Ads faktenbasiert. Keine 1:1 Copycat-Empfehlungen." },
        { role: "user", content }
      ]
    })
  });
  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "OpenRouter Competitor Analyse fehlgeschlagen.");
  return { model, generated: normalizeGeneratedAnalysis(extractJsonObject(textFromContent(payload.choices?.[0]?.message?.content))) };
}

export async function analyzeCompetitorCreative(clientId: string, creativeId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: creative, error: creativeError }, { data: competitors }, cpmBase] = await Promise.all([
    supabase.from("competitor_creatives").select("*").eq("client_id", clientId).eq("id", creativeId).single(),
    supabase.from("competitors").select("id,name,website_url,meta_page_id,meta_ad_library_url,notes").eq("client_id", clientId),
    ownCpm(clientId)
  ]);
  if (creativeError || !creative) throw new Error(creativeError?.message ?? "Competitor Creative wurde nicht gefunden.");
  const typedCreative = creative as CreativeRow;
  const competitor = ((competitors ?? []) as CompetitorRow[]).find((item) => item.id === typedCreative.competitor_id) ?? null;
  const prompt = `Analysiere dieses Competitor Meta Creative fuer Paid Social.

Competitor: ${competitor?.name ?? "Unbekannt"}
Eigener CPM fuer Budget-Schaetzung: ${cpmBase.cpm.toFixed(2)} (${cpmBase.confidence})

Creative JSON:
${JSON.stringify({
    format: typedCreative.format,
    status: typedCreative.status,
    sourceUrl: typedCreative.source_url,
    startedAt: typedCreative.started_at,
    endedAt: typedCreative.ended_at,
    activeDays: typedCreative.active_days,
    reachMin: typedCreative.reach_min,
    reachMax: typedCreative.reach_max,
    reachEstimate: typedCreative.reach_estimate,
    estimatedSpend: typedCreative.estimated_spend,
    primaryText: typedCreative.primary_text,
    headline: typedCreative.headline,
    hook: typedCreative.hook,
    cta: typedCreative.cta,
    landingUrl: typedCreative.landing_url
  }, null, 2)}

Antworte exakt als JSON mit Keys:
hook, hookExplanation, body, ending, visualElements, detectedText, offer, angle, funnelStage, emotionScores, strengths, weaknesses, hypotheses, adaptationIdeas, rankingScore.

Regeln:
- hook ist nur der sichtbare oder angegebene Hook-Text, keine Analyse.
- emotionScores hat Keys curiosity, desire, trust, urgency, joy, fearOfMissingOut mit 0-100.
- adaptationIdeas sind konkrete Ideen, wie wir das Pattern fuer den Kunden adaptieren koennen, ohne zu kopieren.
- rankingScore bewertet Competitor-Relevanz und Adaptierbarkeit von 0-100.`;

  const imageUrl = typedCreative.image_url ?? typedCreative.thumbnail_url;
  const { model, generated } = await callOpenRouterForCompetitorAnalysis(prompt, imageUrl);
  const { data: inserted, error: insertError } = await supabase
    .from("competitor_creative_analyses")
    .insert({
      client_id: clientId,
      competitor_creative_id: creativeId,
      model,
      status: "completed",
      hook: generated.hook || typedCreative.hook,
      hook_explanation: generated.hookExplanation || null,
      body: generated.body || null,
      ending: generated.ending || null,
      visual_elements: generated.visualElements,
      detected_text: generated.detectedText || null,
      offer: generated.offer || null,
      angle: generated.angle || null,
      funnel_stage: generated.funnelStage,
      emotion_scores: generated.emotionScores,
      strengths: generated.strengths,
      weaknesses: generated.weaknesses,
      hypotheses: generated.hypotheses,
      adaptation_ideas: generated.adaptationIdeas,
      ranking_score: generated.rankingScore,
      raw: generated as unknown as JsonRecord
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "Competitor Analyse konnte nicht gespeichert werden.");
  return getCompetitorOverview(clientId);
}

export async function getCompetitorIdeaPatterns(clientId: string) {
  const overview = await getCompetitorOverview(clientId);
  return overview.creatives
    .filter((creative) => creative.analysis?.hook || creative.hook)
    .slice(0, 10)
    .map((creative) => ({
      competitor: creative.competitorName,
      hook: creative.analysis?.hook ?? creative.hook,
      angle: creative.analysis?.angle,
      format: creative.format,
      funnelStage: creative.analysis?.funnelStage,
      estimatedSpend: creative.estimatedSpend,
      reachEstimate: creative.reachEstimate,
      rankingScore: creative.rankingScore,
      adaptationIdeas: creative.analysis?.adaptationIdeas ?? [],
      copycatRisk: "Pattern adaptieren, nicht kopieren. Hook neu formulieren und an Kundenprofil/Brand Voice anpassen."
    }));
}
