import "server-only";

import { getOptionalEnv } from "@/lib/env";
import { listClientCreatives, type CreativeListItem } from "@/lib/creatives";
import { getCompetitorIdeaPatterns } from "@/lib/competitors";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

type AnalysisRow = {
  creative_id: string | null;
  hook: string | null;
  summary: string | null;
  funnel_stage: string | null;
  visual_elements: JsonRecord | null;
  raw: JsonRecord | null;
  created_at: string;
};

type MetaAdRow = {
  id: string;
  creative_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  name: string | null;
  status: string | null;
  effective_status: string | null;
};

type CampaignRow = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
};

type AdSetRow = {
  id: string;
  name: string | null;
  optimization_goal: string | null;
  status: string | null;
  effective_status: string | null;
};

type IdeaRow = {
  id: string;
  client_id: string;
  generation_id: string | null;
  status: string;
  format: string;
  funnel_stage: string | null;
  hook: string;
  angle: string | null;
  concept: string | null;
  visual_direction: string | null;
  first_seconds: string | null;
  script_outline: string | null;
  primary_text: string | null;
  headline: string | null;
  cta: string | null;
  rationale: string | null;
  score: number | string | null;
  source_patterns: unknown;
  meta_context: JsonRecord | null;
  created_at: string;
};

type GeneratedIdea = {
  hook: string;
  angle?: string;
  concept?: string;
  format?: string;
  funnelStage?: string;
  visualDirection?: string;
  firstSeconds?: string;
  scriptOutline?: string;
  primaryText?: string;
  headline?: string;
  cta?: string;
  rationale?: string;
  score?: number;
  sourcePatterns?: string[];
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
};

export type HookInsight = {
  hook: string;
  creativeCount: number;
  avgScore: number;
  spend: number;
  impressions: number;
  purchases: number;
  ctr: number | null;
  hookRate: number | null;
  holdRate: number | null;
  outboundCvr: number | null;
  roas: number | null;
  formats: string[];
  funnelStages: string[];
  campaignObjectives: string[];
  optimizationGoals: string[];
  exampleCreativeIds: string[];
  exampleCreativeNames: string[];
};

export type AdIdea = {
  id: string;
  status: string;
  format: string;
  funnelStage: string | null;
  hook: string;
  angle: string | null;
  concept: string | null;
  visualDirection: string | null;
  firstSeconds: string | null;
  scriptOutline: string | null;
  primaryText: string | null;
  headline: string | null;
  cta: string | null;
  rationale: string | null;
  score: number | null;
  sourcePatterns: string[];
  metaContext: JsonRecord;
  createdAt: string;
};

export type AdIdeasOverview = {
  ideas: AdIdea[];
  hookInsights: HookInsight[];
  totals: {
    ideas: number;
    hooks: number;
    analyzedCreatives: number;
    activeAds: number;
  };
  metaContextSummary: JsonRecord;
  error: string | null;
};

export type GenerateAdIdeasOptions = {
  count?: number;
  format?: "all" | "reel" | "static" | "carousel";
  funnelStage?: "ALL" | "TOFU" | "MOFU" | "BOFU";
  focus?: string;
};

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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function normalizeFormat(value: unknown) {
  const format = stringValue(value).toLowerCase();
  if (format === "static" || format === "image") return "static";
  if (format === "carousel") return "carousel";
  return "reel";
}

function normalizeFunnel(value: unknown) {
  const funnel = stringValue(value).toUpperCase();
  if (funnel === "TOFU" || funnel === "MOFU" || funnel === "BOFU") return funnel;
  return null;
}

function latestAnalyses(rows: AnalysisRow[]) {
  const map = new Map<string, AnalysisRow>();
  for (const row of rows) {
    if (!row.creative_id || map.has(row.creative_id)) continue;
    map.set(row.creative_id, row);
  }
  return map;
}

function compactCounts(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
}

function mapIdea(row: IdeaRow): AdIdea {
  return {
    id: row.id,
    status: row.status,
    format: row.format,
    funnelStage: row.funnel_stage,
    hook: row.hook,
    angle: row.angle,
    concept: row.concept,
    visualDirection: row.visual_direction,
    firstSeconds: row.first_seconds,
    scriptOutline: row.script_outline,
    primaryText: row.primary_text,
    headline: row.headline,
    cta: row.cta,
    rationale: row.rationale,
    score: nullableNumber(row.score),
    sourcePatterns: stringArray(row.source_patterns),
    metaContext: row.meta_context ?? {},
    createdAt: row.created_at
  };
}

async function loadContext(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const [{ creatives }, { data: analyses }, { data: ads }, { data: campaigns }, { data: adsets }] = await Promise.all([
    listClientCreatives(clientId),
    supabase.from("creative_ai_analyses").select("creative_id,hook,summary,funnel_stage,visual_elements,raw,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
    supabase.from("meta_ads").select("id,creative_id,campaign_id,adset_id,name,status,effective_status").eq("client_id", clientId),
    supabase.from("meta_campaigns").select("id,name,objective,status,effective_status").eq("client_id", clientId),
    supabase.from("meta_ad_sets").select("id,name,optimization_goal,status,effective_status").eq("client_id", clientId)
  ]);

  return {
    creatives,
    analyses: latestAnalyses((analyses ?? []) as AnalysisRow[]),
    ads: (ads ?? []) as MetaAdRow[],
    campaigns: (campaigns ?? []) as CampaignRow[],
    adsets: (adsets ?? []) as AdSetRow[]
  };
}

function buildHookInsights(context: Awaited<ReturnType<typeof loadContext>>) {
  const adsByCreative = new Map<string, MetaAdRow[]>();
  for (const ad of context.ads) {
    if (!ad.creative_id) continue;
    adsByCreative.set(ad.creative_id, [...(adsByCreative.get(ad.creative_id) ?? []), ad]);
  }

  const campaignsById = new Map(context.campaigns.map((campaign) => [campaign.id, campaign]));
  const adsetsById = new Map(context.adsets.map((adset) => [adset.id, adset]));
  const groups = new Map<string, CreativeListItem[]>();

  for (const creative of context.creatives) {
    const hook = context.analyses.get(creative.id)?.hook?.trim();
    if (!hook) continue;
    groups.set(hook, [...(groups.get(hook) ?? []), creative]);
  }

  return [...groups.entries()]
    .map(([hook, creatives]): HookInsight => {
      const spend = creatives.reduce((sum, creative) => sum + creative.metrics.spend, 0);
      const impressions = creatives.reduce((sum, creative) => sum + creative.metrics.impressions, 0);
      const purchases = creatives.reduce((sum, creative) => sum + creative.metrics.purchases, 0);
      const purchaseValue = creatives.reduce((sum, creative) => sum + creative.metrics.purchaseValue, 0);
      const clicks = creatives.reduce((sum, creative) => sum + creative.metrics.clicks, 0);
      const outboundClicks = creatives.reduce((sum, creative) => sum + creative.metrics.outboundClicks, 0);
      const video3s = creatives.reduce((sum, creative) => sum + creative.metrics.video3sViews, 0);
      const thruplays = creatives.reduce((sum, creative) => sum + creative.metrics.thruplays, 0);
      const linkedAds = creatives.flatMap((creative) => adsByCreative.get(creative.id) ?? []);
      const campaignObjectives = linkedAds.map((ad) => ad.campaign_id ? campaignsById.get(ad.campaign_id)?.objective ?? "" : "").filter(Boolean);
      const optimizationGoals = linkedAds.map((ad) => ad.adset_id ? adsetsById.get(ad.adset_id)?.optimization_goal ?? "" : "").filter(Boolean);

      return {
        hook,
        creativeCount: creatives.length,
        avgScore: Math.round(creatives.reduce((sum, creative) => sum + creative.performanceScore.score, 0) / creatives.length),
        spend,
        impressions,
        purchases,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
        hookRate: impressions > 0 ? (video3s / impressions) * 100 : null,
        holdRate: video3s > 0 ? (thruplays / video3s) * 100 : null,
        outboundCvr: outboundClicks > 0 ? (purchases / outboundClicks) * 100 : null,
        roas: spend > 0 ? purchaseValue / spend : null,
        formats: [...new Set(creatives.map((creative) => creative.type))],
        funnelStages: [...new Set(creatives.map((creative) => creative.funnelStage).filter(Boolean) as string[])],
        campaignObjectives: [...new Set(campaignObjectives)].slice(0, 4),
        optimizationGoals: [...new Set(optimizationGoals)].slice(0, 4),
        exampleCreativeIds: creatives.slice(0, 3).map((creative) => creative.id),
        exampleCreativeNames: creatives.slice(0, 3).map((creative) => creative.name)
      };
    })
    .filter((insight) => insight.impressions > 0 || insight.spend > 0)
    .sort((a, b) => b.avgScore - a.avgScore || b.spend - a.spend)
    .slice(0, 20);
}

function metaContextSummary(context: Awaited<ReturnType<typeof loadContext>>) {
  const activeAds = context.ads.filter((ad) => ad.effective_status === "ACTIVE" || ad.status === "ACTIVE");
  const campaignsById = new Map(context.campaigns.map((campaign) => [campaign.id, campaign]));
  const adsetsById = new Map(context.adsets.map((adset) => [adset.id, adset]));

  return {
    activeAds: activeAds.length,
    campaignObjectives: compactCounts(activeAds.map((ad) => ad.campaign_id ? campaignsById.get(ad.campaign_id)?.objective ?? "" : "")),
    optimizationGoals: compactCounts(activeAds.map((ad) => ad.adset_id ? adsetsById.get(ad.adset_id)?.optimization_goal ?? "" : "")),
    adNamePatterns: activeAds.map((ad) => ad.name).filter(Boolean).slice(0, 12)
  };
}

export async function getAdIdeasOverview(clientId: string): Promise<AdIdeasOverview> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [context, { data: ideas, error: ideasError }] = await Promise.all([
      loadContext(clientId),
      supabase
        .from("ad_ideas")
        .select("id,client_id,generation_id,status,format,funnel_stage,hook,angle,concept,visual_direction,first_seconds,script_outline,primary_text,headline,cta,rationale,score,source_patterns,meta_context,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
    ]);

    if (ideasError) throw new Error(ideasError.message);

    const hookInsights = buildHookInsights(context);
    const metaSummary = metaContextSummary(context);
    return {
      ideas: ((ideas ?? []) as IdeaRow[]).map(mapIdea),
      hookInsights,
      totals: {
        ideas: ideas?.length ?? 0,
        hooks: hookInsights.length,
        analyzedCreatives: context.analyses.size,
        activeAds: numberValue(metaSummary.activeAds)
      },
      metaContextSummary: metaSummary,
      error: null
    };
  } catch (error) {
    return {
      ideas: [],
      hookInsights: [],
      totals: { ideas: 0, hooks: 0, analyzedCreatives: 0, activeAds: 0 },
      metaContextSummary: {},
      error: error instanceof Error ? error.message : "Ad Ideas konnten nicht geladen werden."
    };
  }
}

async function callOpenRouter(prompt: string) {
  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY fehlt.");
  const model = getOptionalEnv("OPENROUTER_TEXT_MODEL", "openai/gpt-5.2");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": getOptionalEnv("OPENROUTER_HTTP_REFERER", "http://localhost:3000"),
      "x-title": getOptionalEnv("OPENROUTER_APP_TITLE", "Herb Ads")
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Du bist ein Senior Performance-Creative-Strategist fuer Meta Ads. Antworte ausschliesslich mit validem JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.8
    })
  });
  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "OpenRouter Ad Ideas Anfrage fehlgeschlagen.");
  return { model, payload, text: textFromContent(payload.choices?.[0]?.message?.content) };
}

function normalizeGeneratedIdeas(payload: JsonRecord) {
  const ideas = Array.isArray(payload.ideas) ? payload.ideas : [];
  return ideas.map((idea): GeneratedIdea => {
    const record = (idea && typeof idea === "object" && !Array.isArray(idea) ? idea : {}) as JsonRecord;
    return {
      hook: stringValue(record.hook),
      angle: stringValue(record.angle),
      concept: stringValue(record.concept),
      format: normalizeFormat(record.format),
      funnelStage: normalizeFunnel(record.funnelStage) ?? undefined,
      visualDirection: stringValue(record.visualDirection),
      firstSeconds: stringValue(record.firstSeconds),
      scriptOutline: stringValue(record.scriptOutline),
      primaryText: stringValue(record.primaryText),
      headline: stringValue(record.headline),
      cta: stringValue(record.cta),
      rationale: stringValue(record.rationale),
      score: nullableNumber(record.score) ?? undefined,
      sourcePatterns: stringArray(record.sourcePatterns)
    };
  }).filter((idea) => idea.hook);
}

export async function generateAdIdeas(clientId: string, options: GenerateAdIdeasOptions = {}) {
  const supabase = createSupabaseServiceRoleClient();
  const context = await loadContext(clientId);
  const hookInsights = buildHookInsights(context);
  const metaSummary = metaContextSummary(context);
  const competitorPatterns = await getCompetitorIdeaPatterns(clientId);
  const { data: recentIdeas } = await supabase
    .from("ad_ideas")
    .select("hook,angle,concept,headline,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(20);
  const count = Math.max(1, Math.min(20, Math.floor(options.count ?? 10)));
  const learningMode = (options.focus ?? "").includes("LEARNING_GENERATION_MODE");
  const promptContext = {
    options: { count, format: options.format ?? "all", funnelStage: options.funnelStage ?? "ALL", focus: options.focus ?? "" },
    metaSummary,
    topHooks: hookInsights.slice(0, 10),
    weakHooks: hookInsights.slice(-5),
    competitorPatterns,
    recentIdeas: (recentIdeas ?? []).map((idea) => ({ hook: idea.hook, angle: idea.angle, concept: idea.concept, headline: idea.headline })),
    generationMode: learningMode ? "learning_synthesis" : "standard_ad_ideas",
    recentIdeasContext: "Vermeide reine Wiederholungen bestehender Hooks, Headlines und Konzepte. Nutze Gewinner-Patterns nur als abstrakte Signale, nicht als Textbausteine."
  };
  const prompt = `Erstelle ${count} neue Meta Ad Ideen fuer Reels und Static Images. Nutze echte Meta-Ads-Daten, Hook Performance, Campaign Objectives und Optimization Goals.

${learningMode ? "WICHTIG: Du bist im Creative-Learning-Modus. Deine Aufgabe ist Synthese, nicht Remix. Bestehende Hooks, Headlines, Konzepte, Competitor Patterns oder Top-Hooks duerfen nicht umformuliert oder als Schablone kopiert werden. Extrahiere nur das dahinterliegende Prinzip und entwickle daraus neue strategische Konzepte." : ""}

Kontext JSON:
${JSON.stringify(promptContext, null, 2)}

Antworte exakt als JSON Objekt mit Key ideas. Jedes Item braucht:
hook, angle, concept, format (reel|static|carousel), funnelStage (TOFU|MOFU|BOFU), visualDirection, firstSeconds, scriptOutline, primaryText, headline, cta, rationale, score (0-100), sourcePatterns (Array).

Regeln:
- Ideen muessen konkret produzierbar sein.
- Reels brauchen einen starken First-3-Seconds Einstieg.
- Static Ideen brauchen klare Bildidee und Headline.
- Beruecksichtige Meta Kontext wie Objective, Optimization Goal, aktive Ads und Gewinner-Hooks.
- Kopiere keine bestehenden Hook-Texte, Headlines oder Konzepte aus topHooks, weakHooks, recentIdeas oder competitorPatterns.
- Jede Idee muss ein neues strategisches Konzept enthalten, nicht nur einen anderen Satzbau.
- sourcePatterns sollen das genutzte Learning benennen, nicht den kopierten Text.
- rationale muss erklaeren, welches Performance-Learning transformiert wurde und warum die neue Idee anders ist.
- Beruecksichtige competitorPatterns als Inspirationsquelle, aber kopiere keine Competitor Ads 1:1.
- Wenn eine Idee von Competitor Patterns inspiriert ist, erklaere die Adaption in rationale und sourcePatterns.
- Keine verbotenen Versprechen erfinden.`;
  const { model, payload, text } = await callOpenRouter(prompt);
  const generated = normalizeGeneratedIdeas(extractJsonObject(text));

  const { data: generation, error: generationError } = await supabase
    .from("ad_idea_generations")
    .insert({ client_id: clientId, model, options: promptContext.options, prompt_context: promptContext, raw_response: payload as unknown as JsonRecord })
    .select("id")
    .single();
  if (generationError || !generation) throw new Error(generationError?.message ?? "Ad Ideas Generation konnte nicht gespeichert werden.");

  if (generated.length > 0) {
    const { error: ideasError } = await supabase.from("ad_ideas").insert(
      generated.map((idea) => ({
        client_id: clientId,
        generation_id: generation.id,
        status: "new",
        format: idea.format ?? "reel",
        funnel_stage: normalizeFunnel(idea.funnelStage) ?? null,
        hook: idea.hook,
        angle: idea.angle || null,
        concept: idea.concept || null,
        visual_direction: idea.visualDirection || null,
        first_seconds: idea.firstSeconds || null,
        script_outline: idea.scriptOutline || null,
        primary_text: idea.primaryText || null,
        headline: idea.headline || null,
        cta: idea.cta || null,
        rationale: idea.rationale || null,
        score: idea.score ?? null,
        source_patterns: idea.sourcePatterns ?? [],
        meta_context: { topHooks: hookInsights.slice(0, 3), competitorPatterns: competitorPatterns.slice(0, 3), metaSummary },
        raw: idea as JsonRecord
      }))
    );
    if (ideasError) throw new Error(ideasError.message);
  }

  return getAdIdeasOverview(clientId);
}

export async function updateAdIdeaStatus(clientId: string, ideaId: string, status: string) {
  const allowed = new Set(["new", "shortlisted", "in_production", "launched", "learned", "rejected"]);
  if (!allowed.has(status)) throw new Error("Ungueltiger Ideenstatus.");
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("ad_ideas").update({ status }).eq("client_id", clientId).eq("id", ideaId);
  if (error) throw new Error(error.message);
  return getAdIdeasOverview(clientId);
}
