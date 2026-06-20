import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { type CreativeInsightDateRange, type CreativeListItem, listClientCreatives } from "@/lib/creatives";
import { getOptionalEnv } from "@/lib/env";
import { formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/metrics";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getHookTranscript, type CreativeVideoTranscript } from "@/lib/video-transcripts";

type JsonRecord = Record<string, unknown>;

export type IterationFormat = "static" | "video";
export type GenerateIterationFormat = IterationFormat | "all";
export type IterationStatus = "new" | "shortlisted" | "in_production" | "tested" | "winner" | "rejected";

type IterationRow = {
  id: string;
  generation_id: string | null;
  source_creative_id: string;
  format: string;
  status: string;
  title: string;
  angle: string | null;
  description: string | null;
  hook: string | null;
  script: string | null;
  production_notes: string | null;
  rationale: string | null;
  score: number | string | null;
  performance_snapshot: JsonRecord | null;
  raw: JsonRecord | null;
  created_at: string;
  updated_at: string;
};

type GenerationRow = {
  id: string;
  client_id: string;
  generation_key: string;
  format: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  error_message: string | null;
  created_at: string;
};

type AnalysisRow = {
  creative_id: string | null;
  hook: string | null;
  summary: string | null;
  funnel_stage: string | null;
  visual_elements: JsonRecord | null;
  detected_text: string | null;
  hypotheses: unknown;
  raw: JsonRecord | null;
  created_at: string;
};

type TranscriptRow = {
  creative_id: string;
  provider: string;
  model: string;
  status: string;
  language: string | null;
  transcript: string | null;
  segments: unknown;
  duration_seconds: number | string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type SourceCreative = {
  creative: CreativeListItem;
  analysis: AnalysisRow | null;
  transcript: CreativeVideoTranscript | null;
};

type GeneratedIteration = {
  sourceCreativeId: string;
  title: string;
  angle?: string;
  description?: string;
  hook?: string;
  script?: string;
  productionNotes?: string;
  rationale?: string;
  score?: number;
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
};

export type AdIteration = {
  id: string;
  generationId: string | null;
  sourceCreativeId: string;
  sourceCreativeName: string;
  sourceCreativeType: string;
  sourceCreativeHref: string;
  format: IterationFormat;
  status: IterationStatus;
  title: string;
  angle: string | null;
  description: string | null;
  hook: string | null;
  script: string | null;
  productionNotes: string | null;
  rationale: string | null;
  score: number | null;
  performanceSnapshot: JsonRecord;
  raw: JsonRecord;
  createdAt: string;
  updatedAt: string;
};

export type AdIterationsOverview = {
  statics: AdIteration[];
  videos: AdIteration[];
  latestGenerations: GenerationRow[];
  totals: {
    all: number;
    statics: number;
    videos: number;
  };
  error: string | null;
};

export type GenerateAdIterationsOptions = CreativeInsightDateRange & {
  format?: GenerateIterationFormat;
  count?: number;
  generationKey?: string;
  mode?: "manual" | "weekly";
};

type GenerationSummary = {
  clientId: string;
  format: IterationFormat;
  status: "completed" | "skipped" | "failed";
  created: number;
  sourceCount: number;
  generationId?: string;
  error?: string;
};

const ITERATION_STATUSES = new Set<IterationStatus>(["new", "shortlisted", "in_production", "tested", "winner", "rejected"]);
const STATIC_TYPES = new Set(["image", "post", "catalog", "carousel"]);
const VIDEO_TYPES = new Set(["video"]);

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

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value: string): IterationStatus {
  return ITERATION_STATUSES.has(value as IterationStatus) ? (value as IterationStatus) : "new";
}

function normalizeFormat(value: string): IterationFormat {
  return value === "video" ? "video" : "static";
}

function normalizeGenerateFormat(value: unknown): GenerateIterationFormat {
  return value === "static" || value === "video" || value === "all" ? value : "all";
}

function normalizeGeneratedIterations(payload: JsonRecord): GeneratedIteration[] {
  const iterations = Array.isArray(payload.iterations) ? payload.iterations : [];
  return iterations
    .map((iteration) => {
      const record = (iteration && typeof iteration === "object" && !Array.isArray(iteration) ? iteration : {}) as JsonRecord;
      return {
        sourceCreativeId: stringValue(record.sourceCreativeId),
        title: stringValue(record.title),
        angle: stringValue(record.angle),
        description: stringValue(record.description),
        hook: stringValue(record.hook),
        script: stringValue(record.script),
        productionNotes: stringValue(record.productionNotes),
        rationale: stringValue(record.rationale),
        score: numberValue(record.score) ?? undefined
      };
    })
    .filter((iteration) => iteration.sourceCreativeId && iteration.title);
}

function mapTranscript(row: TranscriptRow): CreativeVideoTranscript {
  const segments = Array.isArray(row.segments)
    ? row.segments
        .map((segment) => {
          if (!segment || typeof segment !== "object") return null;
          const record = segment as JsonRecord;
          const text = stringValue(record.text);
          if (!text) return null;
          return {
            start: numberValue(record.start),
            end: numberValue(record.end),
            text
          };
        })
        .filter((segment): segment is { start: number | null; end: number | null; text: string } => Boolean(segment))
    : [];

  return {
    id: `${row.creative_id}-transcript`,
    provider: row.provider,
    model: row.model,
    status: row.status,
    language: row.language,
    transcript: row.transcript,
    segments,
    durationSeconds: numberValue(row.duration_seconds),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function latestByCreative<T extends { creative_id: string | null; created_at: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!row.creative_id || map.has(row.creative_id)) continue;
    map.set(row.creative_id, row);
  }
  return map;
}

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function today() {
  return dateInput(new Date());
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return dateInput(date);
}

function defaultDateRange(options: GenerateAdIterationsOptions): Required<CreativeInsightDateRange> {
  return {
    since: options.since ?? daysAgo(29),
    until: options.until ?? today()
  };
}

function isoWeekKey(date = new Date()) {
  const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((working.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${working.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function generationKey(options: GenerateAdIterationsOptions) {
  if (options.generationKey) return options.generationKey;
  if (options.mode === "weekly") return `weekly:${isoWeekKey()}`;
  return `manual:${Date.now()}`;
}

function sourceTypeMatches(creative: CreativeListItem, format: IterationFormat) {
  const type = creative.type.toLowerCase();
  return format === "video" ? VIDEO_TYPES.has(type) : STATIC_TYPES.has(type);
}

function enoughPerformance(creative: CreativeListItem) {
  return creative.performanceScore.score >= 60 && (creative.metrics.spend >= 50 || creative.metrics.impressions >= 2000);
}

function performanceSnapshot(source: SourceCreative) {
  const { creative, analysis } = source;
  return {
    creative: {
      id: creative.id,
      name: creative.name,
      type: creative.type,
      status: creative.status,
      firstActiveDate: creative.firstActiveDate,
      landingUrl: creative.landingUrl
    },
    score: creative.performanceScore,
    metrics: creative.metrics,
    analysis: analysis
      ? {
          hook: analysis.hook,
          summary: analysis.summary,
          angle: stringValue(analysis.raw?.angle) || null,
          funnelStage: analysis.funnel_stage,
          visualElements: analysis.visual_elements,
          detectedText: analysis.detected_text,
          hypotheses: stringArray(analysis.hypotheses)
        }
      : null
  };
}

function sourcePromptRecord(source: SourceCreative) {
  const { creative, analysis, transcript } = source;
  return {
    sourceCreativeId: creative.id,
    name: creative.name,
    type: creative.type,
    title: creative.title,
    body: creative.body,
    cta: creative.cta,
    landingUrl: creative.landingUrl,
    performance: {
      score: creative.performanceScore.score,
      confidence: creative.performanceScore.confidence,
      spend: creative.metrics.spend,
      impressions: creative.metrics.impressions,
      reach: creative.metrics.reach,
      purchases: creative.metrics.purchases,
      purchaseValue: creative.metrics.purchaseValue,
      roas: creative.metrics.roas,
      ctr: creative.metrics.ctr,
      hookRate: creative.metrics.hookRate,
      holdRate: creative.metrics.holdRate,
      outboundCvr: creative.metrics.outboundCvr,
      cpa: creative.metrics.costPerPurchase
    },
    analysis: analysis
      ? {
          hook: analysis.hook,
          summary: analysis.summary,
          angle: stringValue(analysis.raw?.angle) || null,
          funnelStage: analysis.funnel_stage,
          visualElements: analysis.visual_elements,
          detectedText: analysis.detected_text,
          hypotheses: stringArray(analysis.hypotheses),
          recommendations: stringArray(analysis.raw?.recommendations)
        }
      : null,
    videoTranscript: transcript?.status === "completed" && transcript.transcript
      ? {
          hookTranscript: getHookTranscript(transcript),
          transcript: transcript.transcript.slice(0, 10000),
          durationSeconds: transcript.durationSeconds,
          language: transcript.language
        }
      : null
  };
}

async function loadSources(clientId: string, format: IterationFormat, dateRange: Required<CreativeInsightDateRange>, limit: number) {
  const supabase = createSupabaseServiceRoleClient();
  const [{ creatives }, { data: analyses }, { data: transcripts }] = await Promise.all([
    listClientCreatives(clientId, dateRange),
    supabase
      .from("creative_ai_analyses")
      .select("creative_id,hook,summary,funnel_stage,visual_elements,detected_text,hypotheses,raw,created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("creative_video_transcripts")
      .select("creative_id,provider,model,status,language,transcript,segments,duration_seconds,error_message,created_at,updated_at")
      .eq("client_id", clientId)
  ]);

  const analysesByCreative = latestByCreative((analyses ?? []) as AnalysisRow[]);
  const transcriptsByCreative = new Map(((transcripts ?? []) as TranscriptRow[]).map((row) => [row.creative_id, mapTranscript(row)]));
  const candidates = creatives
    .filter((creative) => sourceTypeMatches(creative, format))
    .filter(enoughPerformance)
    .map((creative): SourceCreative => ({
      creative,
      analysis: analysesByCreative.get(creative.id) ?? null,
      transcript: transcriptsByCreative.get(creative.id) ?? null
    }))
    .filter((source) => format !== "video" || (source.transcript?.status === "completed" && Boolean(source.transcript.transcript)))
    .sort((a, b) => b.creative.performanceScore.score - a.creative.performanceScore.score || b.creative.metrics.spend - a.creative.metrics.spend);

  return candidates.slice(0, Math.max(limit, 1));
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
      "http-referer": getOptionalEnv("OPENROUTER_HTTP_REFERER", getOptionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3001")),
      "x-title": getOptionalEnv("OPENROUTER_APP_TITLE", "Herb Ads")
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Du bist ein Senior Performance-Creative-Strategist fuer Meta Ads. Antworte ausschliesslich mit validem JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.75
    })
  });
  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "OpenRouter Iterations Anfrage fehlgeschlagen.");
  return { model, payload, text: textFromContent(payload.choices?.[0]?.message?.content) };
}

function iterationPrompt(input: { format: IterationFormat; count: number; sources: SourceCreative[]; dateRange: Required<CreativeInsightDateRange>; recentIterations: Array<{ title: string | null; angle: string | null; source_creative_id: string | null }> }) {
  const formatInstruction = input.format === "static"
    ? "Erzeuge Static-Ad-Iterationen. Fokus: neue Bildidee, Layout-/Overlay-Ansatz, Headline/Title und klare Beschreibung, wie die Vorlage besser oder frischer umgesetzt wird."
    : "Erzeuge Video-Ad-Iterationen. Fokus: neue Hook, konkretes Script, Produktionshinweise/Shotlist und klare Ableitung aus dem funktionierenden Video.";

  return `Erstelle ${input.count} neue ${input.format === "static" ? "Static" : "Video"} Iterationen aus echten Bestperformer Meta Ads.

Zeitraum: ${input.dateRange.since} bis ${input.dateRange.until}

${formatInstruction}

Bestperformer Quellen JSON:
${JSON.stringify(input.sources.map(sourcePromptRecord), null, 2)}

Bereits vorhandene Iterations, nicht wiederholen:
${JSON.stringify(input.recentIterations, null, 2)}

Antworte exakt als JSON Objekt mit Key iterations. Jedes Item braucht:
sourceCreativeId, title, angle, description, hook, script, productionNotes, rationale, score.

Regeln:
- sourceCreativeId muss exakt eine ID aus den Quellen sein.
- Keine 1:1 Kopie der bestehenden Ad, Hook oder Copy.
- Behalte den Gewinner-Mechanismus, aber erstelle eine neue Ausfuehrung.
- title ist kurz und produzierbar.
- angle ist ein kurzes Canonical Label.
- description erklaert in 1-3 Saetzen, was verbessert oder variiert wird.
- productionNotes sind konkrete Produktionsanweisungen.
- rationale erklaert, welches Performance-Learning transformiert wurde.
- score ist 0-100.
- Bei Static Iterations duerfen hook und script leer sein.
- Bei Video Iterations muessen hook und script befuellt sein.`;
}

function mapIteration(row: IterationRow, source: CreativeListItem | undefined, clientId: string): AdIteration {
  const format = normalizeFormat(row.format);
  const sourceCreativeName = source?.name ?? String(row.performance_snapshot?.creative && typeof row.performance_snapshot.creative === "object" && "name" in row.performance_snapshot.creative ? row.performance_snapshot.creative.name : row.source_creative_id);
  return {
    id: row.id,
    generationId: row.generation_id,
    sourceCreativeId: row.source_creative_id,
    sourceCreativeName,
    sourceCreativeType: source?.type ?? String(row.performance_snapshot?.creative && typeof row.performance_snapshot.creative === "object" && "type" in row.performance_snapshot.creative ? row.performance_snapshot.creative.type : "unknown"),
    sourceCreativeHref: `/clients/${clientId}/creatives/${row.source_creative_id}`,
    format,
    status: normalizeStatus(row.status),
    title: row.title,
    angle: row.angle,
    description: row.description,
    hook: row.hook,
    script: row.script,
    productionNotes: row.production_notes,
    rationale: row.rationale,
    score: numberValue(row.score),
    performanceSnapshot: row.performance_snapshot ?? {},
    raw: row.raw ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getAdIterationsOverviewUncached(clientId: string): Promise<AdIterationsOverview> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [{ data: iterationRows, error: iterationsError }, { data: generationRows, error: generationsError }] = await Promise.all([
      supabase
        .from("ad_iterations")
        .select("id,generation_id,source_creative_id,format,status,title,angle,description,hook,script,production_notes,rationale,score,performance_snapshot,raw,created_at,updated_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("ad_iteration_generations")
        .select("id,client_id,generation_key,format,status,period_start,period_end,error_message,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(8)
    ]);

    if (iterationsError) throw new Error(iterationsError.message);
    if (generationsError) throw new Error(generationsError.message);

    const rows = (iterationRows ?? []) as IterationRow[];
    const sourceIds = Array.from(new Set(rows.map((row) => row.source_creative_id)));
    const { creatives } = await listClientCreatives(clientId);
    const creativesById = new Map(creatives.filter((creative) => sourceIds.includes(creative.id)).map((creative) => [creative.id, creative]));
    const iterations = rows.map((row) => mapIteration(row, creativesById.get(row.source_creative_id), clientId));
    const statics = iterations.filter((iteration) => iteration.format === "static");
    const videos = iterations.filter((iteration) => iteration.format === "video");

    return {
      statics,
      videos,
      latestGenerations: (generationRows ?? []) as GenerationRow[],
      totals: {
        all: iterations.length,
        statics: statics.length,
        videos: videos.length
      },
      error: null
    };
  } catch (error) {
    return {
      statics: [],
      videos: [],
      latestGenerations: [],
      totals: { all: 0, statics: 0, videos: 0 },
      error: error instanceof Error ? error.message : "Iterations konnten nicht geladen werden."
    };
  }
}

const getAdIterationsOverviewCached = unstable_cache(
  getAdIterationsOverviewUncached,
  ["ad-iterations-overview-v1"],
  { revalidate: 120, tags: [CACHE_TAGS.iterations] }
);

export async function getAdIterationsOverview(clientId: string) {
  return getAdIterationsOverviewCached(clientId);
}

async function recentIterations(clientId: string, format: IterationFormat) {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("ad_iterations")
    .select("source_creative_id,title,angle")
    .eq("client_id", clientId)
    .eq("format", format)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as Array<{ source_creative_id: string | null; title: string | null; angle: string | null }>;
}

async function generateFormatBatch(clientId: string, format: IterationFormat, options: GenerateAdIterationsOptions): Promise<GenerationSummary> {
  const supabase = createSupabaseServiceRoleClient();
  const dateRange = defaultDateRange(options);
  const key = generationKey(options);
  const count = Math.max(1, Math.min(20, Math.floor(options.count ?? 6)));

  const { data: existing } = await supabase
    .from("ad_iteration_generations")
    .select("id,status")
    .eq("client_id", clientId)
    .eq("generation_key", key)
    .eq("format", format)
    .maybeSingle();

  if (existing) {
    return { clientId, format, status: "skipped", created: 0, sourceCount: 0, generationId: existing.id };
  }

  const { data: generation, error: generationError } = await supabase
    .from("ad_iteration_generations")
    .insert({
      client_id: clientId,
      generation_key: key,
      format,
      status: "running",
      period_start: dateRange.since,
      period_end: dateRange.until,
      options: { ...options, format, count, mode: options.mode ?? "manual" }
    })
    .select("id")
    .single();

  if (generationError || !generation) throw new Error(generationError?.message ?? "Iteration Generation konnte nicht erstellt werden.");

  try {
    const [sources, existingIterations] = await Promise.all([
      loadSources(clientId, format, dateRange, count),
      recentIterations(clientId, format)
    ]);

    const promptContext = {
      format,
      dateRange,
      sourceCount: sources.length,
      sources: sources.map((source) => sourcePromptRecord(source)),
      recentIterations: existingIterations
    };

    if (sources.length === 0) {
      await supabase
        .from("ad_iteration_generations")
        .update({ status: "completed", model: null, prompt_context: promptContext, raw_response: { iterations: [], note: "Keine passenden Bestperformer gefunden." } })
        .eq("id", generation.id);
      revalidateCacheTags(CACHE_TAGS.iterations);
      return { clientId, format, status: "completed", created: 0, sourceCount: 0, generationId: generation.id };
    }

    const { model, payload, text } = await callOpenRouter(iterationPrompt({ format, count, sources, dateRange, recentIterations: existingIterations }));
    const generated = normalizeGeneratedIterations(extractJsonObject(text));
    const sourcesById = new Map(sources.map((source) => [source.creative.id, source]));
    const fallbackSources = sources.slice();
    const insertRows = generated.slice(0, count).map((iteration, index) => {
      const source = sourcesById.get(iteration.sourceCreativeId) ?? fallbackSources[index % fallbackSources.length];
      return {
        client_id: clientId,
        generation_id: generation.id,
        source_creative_id: source.creative.id,
        format,
        status: "new",
        title: iteration.title,
        angle: iteration.angle || null,
        description: iteration.description || null,
        hook: format === "video" ? iteration.hook || null : iteration.hook || null,
        script: format === "video" ? iteration.script || null : iteration.script || null,
        production_notes: iteration.productionNotes || null,
        rationale: iteration.rationale || null,
        score: iteration.score ?? null,
        performance_snapshot: performanceSnapshot(source),
        raw: iteration as unknown as JsonRecord
      };
    });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase.from("ad_iterations").insert(insertRows);
      if (insertError) throw new Error(insertError.message);
    }

    await supabase
      .from("ad_iteration_generations")
      .update({ status: "completed", model, prompt_context: promptContext, raw_response: payload as unknown as JsonRecord })
      .eq("id", generation.id);

    revalidateCacheTags(CACHE_TAGS.iterations);
    return { clientId, format, status: "completed", created: insertRows.length, sourceCount: sources.length, generationId: generation.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Iteration Generation fehlgeschlagen.";
    await supabase
      .from("ad_iteration_generations")
      .update({ status: "failed", error_message: message, raw_response: { error: message } })
      .eq("id", generation.id);
    revalidateCacheTags(CACHE_TAGS.iterations);
    return { clientId, format, status: "failed", created: 0, sourceCount: 0, generationId: generation.id, error: message };
  }
}

export async function generateAdIterations(clientId: string, options: GenerateAdIterationsOptions = {}) {
  const format = normalizeGenerateFormat(options.format ?? "all");
  const formats: IterationFormat[] = format === "all" ? ["static", "video"] : [format];
  const summaries: GenerationSummary[] = [];

  for (const targetFormat of formats) {
    summaries.push(await generateFormatBatch(clientId, targetFormat, { ...options, format: targetFormat }));
  }

  return {
    summaries,
    overview: await getAdIterationsOverview(clientId)
  };
}

export async function updateAdIterationStatus(clientId: string, iterationId: string, status: string) {
  const nextStatus = normalizeStatus(status);
  if (nextStatus !== status) throw new Error("Ungueltiger Iteration Status.");
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("ad_iterations")
    .update({ status: nextStatus })
    .eq("client_id", clientId)
    .eq("id", iterationId);
  if (error) throw new Error(error.message);
  revalidateCacheTags(CACHE_TAGS.iterations);
  return getAdIterationsOverview(clientId);
}

type MetaAdAccountRow = {
  client_id: string;
  clients?: { status?: string | null } | null;
};

export async function generateWeeklyIterationsForAllClients() {
  const supabase = createSupabaseServiceRoleClient();
  const { data: accounts, error } = await supabase
    .from("meta_ad_accounts")
    .select("client_id,clients(status)")
    .eq("status", "active");

  if (error) throw new Error(error.message);

  const clientIds = Array.from(
    new Set(
      ((accounts ?? []) as MetaAdAccountRow[])
        .filter((account) => account.clients?.status !== "archived")
        .map((account) => account.client_id)
    )
  );
  const range = defaultDateRange({ mode: "weekly" });
  const key = generationKey({ mode: "weekly" });
  const results = [];

  for (const clientId of clientIds) {
    const generated = await generateAdIterations(clientId, {
      mode: "weekly",
      generationKey: key,
      format: "all",
      since: range.since,
      until: range.until,
      count: 6
    });
    results.push({ clientId, summaries: generated.summaries });
  }

  return { generationKey: key, range, clients: clientIds.length, results };
}

export function iterationStatusLabel(status: IterationStatus) {
  const labels: Record<IterationStatus, string> = {
    new: "New",
    shortlisted: "Shortlisted",
    in_production: "In Production",
    tested: "Tested",
    winner: "Winner",
    rejected: "Rejected"
  };
  return labels[status];
}

export function iterationPerformanceLine(iteration: AdIteration) {
  const metrics = iteration.performanceSnapshot.metrics as JsonRecord | undefined;
  if (!metrics) return "Keine Performance Snapshot Daten";
  return [
    `Spend ${formatCurrency(Number(metrics.spend ?? 0))}`,
    `ROAS ${formatDecimal(numberValue(metrics.roas))}`,
    `CTR ${formatPercent(numberValue(metrics.ctr))}`,
    `Conv. ${formatNumber(Number(metrics.purchases ?? 0))}`
  ].join(" · ");
}
