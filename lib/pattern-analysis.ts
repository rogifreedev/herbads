import "server-only";

import { listClients } from "@/lib/clients";
import { listClientCreatives, type CreativeListItem } from "@/lib/creatives";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

type AnalysisRow = {
  creative_id: string | null;
  summary: string | null;
  hook: string | null;
  funnel_stage: string | null;
  visual_elements: JsonRecord | null;
  raw: JsonRecord | null;
  created_at: string;
};

export type PatternCreative = CreativeListItem & {
  clientId: string;
  clientName: string;
  analysis: AnalysisRow | null;
};

export type PatternInsight = {
  label: string;
  topShare: number;
  lowShare: number;
  lift: number;
  topCount: number;
  lowCount: number;
};

export type PatternAnalysisResult = {
  topCreatives: PatternCreative[];
  lowCreatives: PatternCreative[];
  insights: PatternInsight[];
  totals: {
    clients: number;
    creatives: number;
    analyzedCreatives: number;
  };
  error: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addAttribute(attributes: string[], label: string, value: unknown) {
  if (typeof value === "boolean") {
    if (value) attributes.push(label);
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 70) attributes.push(`${label}: stark`);
    return;
  }

  if (typeof value === "string" && value.trim()) {
    attributes.push(`${label}: ${value.trim()}`);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = stringValue(item);
      if (normalized) attributes.push(`${label}: ${normalized}`);
    }
  }
}

function creativeAttributes(creative: PatternCreative) {
  const attributes = [`Typ: ${creative.type}`];
  if (creative.funnelStage) attributes.push(`Funnel: ${creative.funnelStage}`);
  if (creative.cta) attributes.push(`CTA: ${creative.cta}`);
  if (creative.videoId || creative.videoUrl || creative.videoEmbedUrl) attributes.push("Format: Video");
  if (creative.landingUrl) attributes.push("Mit Landingpage");

  const visualElements = creative.analysis?.visual_elements;
  if (isRecord(visualElements)) {
    for (const [key, value] of Object.entries(visualElements)) {
      addAttribute(attributes, `Visual ${key}`, value);
    }
  }

  const emotionScores = creative.analysis?.raw?.emotionScores;
  if (isRecord(emotionScores)) {
    for (const [key, value] of Object.entries(emotionScores)) {
      addAttribute(attributes, `Emotion ${key}`, value);
    }
  }

  return attributes;
}

function countAttributes(creatives: PatternCreative[]) {
  const counts = new Map<string, number>();
  for (const creative of creatives) {
    for (const attribute of new Set(creativeAttributes(creative))) {
      counts.set(attribute, (counts.get(attribute) ?? 0) + 1);
    }
  }
  return counts;
}

function topInsights(topCreatives: PatternCreative[], lowCreatives: PatternCreative[]) {
  const topCounts = countAttributes(topCreatives);
  const lowCounts = countAttributes(lowCreatives);
  const labels = new Set([...topCounts.keys(), ...lowCounts.keys()]);

  return [...labels]
    .map((label) => {
      const topCount = topCounts.get(label) ?? 0;
      const lowCount = lowCounts.get(label) ?? 0;
      const topShare = topCreatives.length > 0 ? topCount / topCreatives.length : 0;
      const lowShare = lowCreatives.length > 0 ? lowCount / lowCreatives.length : 0;
      return {
        label,
        topShare,
        lowShare,
        lift: topShare - lowShare,
        topCount,
        lowCount
      };
    })
    .filter((insight) => insight.topCount >= 2 && insight.lift > 0)
    .sort((a, b) => b.lift - a.lift || b.topCount - a.topCount)
    .slice(0, 10);
}

async function latestAnalysesByCreativeId(clientIds: string[]) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("creative_ai_analyses")
    .select("creative_id,summary,hook,funnel_stage,visual_elements,raw,created_at")
    .in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const latest = new Map<string, AnalysisRow>();
  for (const analysis of (data ?? []) as AnalysisRow[]) {
    if (!analysis.creative_id || latest.has(analysis.creative_id)) continue;
    latest.set(analysis.creative_id, analysis);
  }
  return latest;
}

export async function getGlobalPatternAnalysis(): Promise<PatternAnalysisResult> {
  try {
    const { clients, error: clientsError } = await listClients();
    const realClients = clients.filter((client) => client.source === "supabase");
    const analysesByCreativeId = await latestAnalysesByCreativeId(realClients.map((client) => client.id));

    const creativeResults = await Promise.all(
      realClients.map(async (client) => {
        const { creatives } = await listClientCreatives(client.id);
        return creatives.map((creative): PatternCreative => ({
          ...creative,
          clientId: client.id,
          clientName: client.name,
          analysis: analysesByCreativeId.get(creative.id) ?? null
        }));
      })
    );

    const creatives = creativeResults.flat().filter((creative) => creative.metrics.spend > 0 || creative.metrics.impressions > 0);
    const ranked = [...creatives].sort((a, b) => b.performanceScore.score - a.performanceScore.score);
    const groupSize = Math.min(10, Math.max(3, Math.floor(ranked.length * 0.2)));
    const topCreatives = ranked.slice(0, groupSize);
    const lowCreatives = ranked.slice(-groupSize).reverse();

    return {
      topCreatives,
      lowCreatives,
      insights: topInsights(topCreatives, lowCreatives),
      totals: {
        clients: realClients.length,
        creatives: creatives.length,
        analyzedCreatives: creatives.filter((creative) => creative.analysis).length
      },
      error: clientsError
    };
  } catch (error) {
    return {
      topCreatives: [],
      lowCreatives: [],
      insights: [],
      totals: { clients: 0, creatives: 0, analyzedCreatives: 0 },
      error: error instanceof Error ? error.message : "Pattern Analyse konnte nicht geladen werden."
    };
  }
}
