import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getCompetitorOverview, type CompetitorCreative } from "@/lib/competitors";
import { getOptionalEnv } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/metrics";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getHookTranscript } from "@/lib/video-transcripts";

type JsonRecord = Record<string, unknown>;

export type CompetitorIterationFormat = "static" | "video";
export type GenerateCompetitorIterationFormat = CompetitorIterationFormat | "all";
export type CompetitorIterationStatus = "new" | "shortlisted" | "in_production" | "tested" | "winner" | "rejected";

type CompetitorIterationRow = {
  id: string;
  generation_id: string | null;
  source_competitor_creative_id: string;
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

type CompetitorGenerationRow = {
  id: string;
  client_id: string;
  generation_key: string;
  format: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  prompt_context: JsonRecord | null;
  raw_response: JsonRecord | null;
  error_message: string | null;
  created_at: string;
};

type BrandProfile = {
  brandName: string;
  positioning: string | null;
  toneOfVoice: string | null;
  targetAudience: string | null;
  painPoints: string | null;
  buyingTriggers: string | null;
  usps: string | null;
  offers: string | null;
  forbiddenClaims: string | null;
  brandNoGos: string | null;
  ctaPreferences: string | null;
};

type BrandProfileRow = {
  brand_name: string | null;
  positioning: string | null;
  tone_of_voice: string | null;
  target_audience: string | null;
  pain_points: string | null;
  buying_triggers: string | null;
  usps: string | null;
  offers: string | null;
  forbidden_claims: string | null;
  brand_no_gos: string | null;
  cta_preferences: string | null;
};

type ClientRow = {
  name: string | null;
};

type ResolvedIterationDateRange = {
  since: string | null;
  until: string | null;
};

type SourceSelectionMode = "strict" | "score_fallback" | "performance_fallback";

type SourceSelectionDiagnostics = {
  totalCreatives: number;
  competitorFilteredCreatives: number;
  dateFilteredCreatives: number;
  formatMatches: number;
  strictMatches: number;
  scoreFallbackMatches: number;
  performanceFallbackMatches: number;
  selected: number;
  selectionMode: SourceSelectionMode;
  transcriptMatches?: number;
  transcriptMode?: "completed_transcript" | "analysis_or_copy_fallback" | "not_required";
  note: string;
};

type LoadedSources = {
  sources: CompetitorCreative[];
  diagnostics: SourceSelectionDiagnostics;
};

type GeneratedCompetitorIteration = {
  sourceCreativeId: string;
  title: string;
  angle?: string;
  description?: string;
  thesis?: string;
  textOverlay?: string;
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

export type CompetitorIteration = {
  id: string;
  generationId: string | null;
  sourceCreativeId: string;
  sourceCompetitorId: string | null;
  sourceCompetitorName: string;
  sourceCreativeName: string;
  sourceCreativeType: string;
  sourceCreativeHref: string;
  sourceCreativeSourceUrl: string | null;
  sourceCreativeImageUrl: string | null;
  sourceCreativeThumbnailUrl: string | null;
  sourceCreativeVideoUrl: string | null;
  sourceCreativeLandingUrl: string | null;
  sourceCreativeHeadline: string | null;
  sourceCreativePrimaryText: string | null;
  detailHref: string;
  format: CompetitorIterationFormat;
  status: CompetitorIterationStatus;
  title: string;
  angle: string | null;
  description: string | null;
  thesis: string | null;
  textOverlay: string | null;
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

export type CompetitorIterationsOverview = {
  statics: CompetitorIteration[];
  videos: CompetitorIteration[];
  latestGenerations: CompetitorGenerationRow[];
  totals: {
    all: number;
    statics: number;
    videos: number;
  };
  error: string | null;
};

export type GenerateCompetitorIterationsOptions = {
  since?: string | null;
  until?: string | null;
  format?: GenerateCompetitorIterationFormat;
  count?: number;
  competitorId?: string | null;
  generationKey?: string;
  mode?: "manual" | "weekly";
};

type GenerationSummary = {
  clientId: string;
  format: CompetitorIterationFormat;
  status: "completed" | "skipped" | "failed";
  created: number;
  sourceCount: number;
  generationId?: string;
  error?: string;
};

const ITERATION_STATUSES = new Set<CompetitorIterationStatus>(["new", "shortlisted", "in_production", "tested", "winner", "rejected"]);
const VIDEO_FORMATS = new Set(["video", "reel"]);

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value: string): CompetitorIterationStatus {
  return ITERATION_STATUSES.has(value as CompetitorIterationStatus) ? (value as CompetitorIterationStatus) : "new";
}

function normalizeFormat(value: string): CompetitorIterationFormat {
  return value === "video" ? "video" : "static";
}

function normalizeGenerateFormat(value: unknown): GenerateCompetitorIterationFormat {
  return value === "static" || value === "video" || value === "all" ? value : "all";
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

function defaultDateRange(options: GenerateCompetitorIterationsOptions): ResolvedIterationDateRange {
  const hasSince = Object.prototype.hasOwnProperty.call(options, "since");
  const hasUntil = Object.prototype.hasOwnProperty.call(options, "until");

  return {
    since: hasSince ? options.since ?? null : daysAgo(29),
    until: hasUntil ? options.until ?? null : today()
  };
}

function dateRangeLabel(dateRange: ResolvedIterationDateRange) {
  if (dateRange.since && dateRange.until) return `${dateRange.since} bis ${dateRange.until}`;
  if (dateRange.since) return `ab ${dateRange.since}`;
  if (dateRange.until) return `bis ${dateRange.until}`;
  return "gesamter Zeitraum";
}

function isoWeekKey(date = new Date()) {
  const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((working.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${working.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function generationKey(options: GenerateCompetitorIterationsOptions) {
  if (options.generationKey) return options.generationKey;
  if (options.mode === "weekly") return `weekly:${isoWeekKey()}`;
  return `manual:${Date.now()}`;
}

function sourceDate(creative: CompetitorCreative) {
  return (creative.startedAt ?? creative.lastSeenAt ?? creative.createdAt).slice(0, 10);
}

function dateMatches(creative: CompetitorCreative, dateRange: ResolvedIterationDateRange) {
  const date = sourceDate(creative);
  if (dateRange.since && date < dateRange.since) return false;
  if (dateRange.until && date > dateRange.until) return false;
  return true;
}

function hasVideoMedia(creative: CompetitorCreative) {
  return Boolean(creative.videoUrl) || VIDEO_FORMATS.has(creative.format.toLowerCase());
}

function isImageOnlyCreative(creative: CompetitorCreative) {
  const format = creative.format.toLowerCase();
  return (format === "static" || format === "image" || format === "carousel") && Boolean(creative.imageUrl || creative.thumbnailUrl) && !hasVideoMedia(creative);
}

function sourceTypeMatches(creative: CompetitorCreative, format: CompetitorIterationFormat) {
  if (format === "video") return hasVideoMedia(creative);
  return isImageOnlyCreative(creative);
}

function enoughPerformance(creative: CompetitorCreative) {
  return creative.rankingScore >= 60 && ((creative.estimatedSpend ?? 0) >= 50 || (creative.reachEstimate ?? 0) >= 2000);
}

function fallbackPerformance(creative: CompetitorCreative) {
  return creative.rankingScore >= 45 || (creative.estimatedSpend ?? 0) > 0 || (creative.reachEstimate ?? 0) >= 500;
}

function hasAnyPerformance(creative: CompetitorCreative) {
  return (creative.estimatedSpend ?? 0) > 0 || (creative.reachEstimate ?? 0) > 0 || creative.rankingScore > 0;
}

function hasCompletedTranscript(creative: CompetitorCreative) {
  return creative.videoTranscript?.status === "completed" && Boolean(creative.videoTranscript.transcript);
}

function hasVideoIterationContext(creative: CompetitorCreative) {
  if (hasCompletedTranscript(creative)) return true;
  return Boolean(
    creative.analysis?.hook ||
    creative.analysis?.body ||
    creative.analysis?.detectedText ||
    creative.hook ||
    creative.primaryText ||
    creative.headline
  );
}

function sortSourcesByPerformance(a: CompetitorCreative, b: CompetitorCreative) {
  return (
    b.rankingScore - a.rankingScore ||
    (b.estimatedSpend ?? 0) - (a.estimatedSpend ?? 0) ||
    (b.reachEstimate ?? 0) - (a.reachEstimate ?? 0) ||
    (b.activeDays ?? 0) - (a.activeDays ?? 0)
  );
}

function sourceSelectionNote(diagnostics: Omit<SourceSelectionDiagnostics, "note">) {
  if (diagnostics.selected === 0) {
    return `Keine Competitor-Quellen gefunden. Format-Matches: ${diagnostics.formatMatches}, strenge Bestperformer: ${diagnostics.strictMatches}, Fallback-Kandidaten: ${diagnostics.scoreFallbackMatches}.`;
  }
  if (diagnostics.selectionMode === "strict") {
    return `${diagnostics.selected} Competitor-Bestperformer als Quellen genutzt.`;
  }
  if (diagnostics.selectionMode === "score_fallback") {
    return `${diagnostics.selected} Competitor-Quellen ueber Score-/Performance-Fallback genutzt.`;
  }
  return `${diagnostics.selected} Competitor-Quellen mit vorhandener Performance genutzt.`;
}

function performanceSnapshot(creative: CompetitorCreative) {
  return {
    creative: {
      id: creative.id,
      competitorId: creative.competitorId,
      competitorName: creative.competitorName,
      adLibraryId: creative.adLibraryId,
      sourceUrl: creative.sourceUrl,
      format: creative.format,
      status: creative.status,
      startedAt: creative.startedAt,
      landingUrl: creative.landingUrl
    },
    metrics: {
      reachEstimate: creative.reachEstimate,
      reachMin: creative.reachMin,
      reachMax: creative.reachMax,
      estimatedSpend: creative.estimatedSpend,
      estimatedDailySpend: creative.estimatedDailySpend,
      activeDays: creative.activeDays,
      rankingScore: creative.rankingScore
    },
    audience: {
      ageRanges: creative.ageRanges,
      genderSignals: creative.genderSignals,
      audienceLocations: creative.audienceLocations,
      audienceInterests: creative.audienceInterests
    },
    analysis: creative.analysis
      ? {
          hook: creative.analysis.hook,
          angle: creative.analysis.angle,
          body: creative.analysis.body,
          thesis: creative.analysis.thesis,
          visualElements: creative.analysis.visualElements,
          detectedText: creative.analysis.detectedText,
          offer: creative.analysis.offer,
          funnelStage: creative.analysis.funnelStage,
          emotionScores: creative.analysis.emotionScores,
          strengths: creative.analysis.strengths,
          hypotheses: creative.analysis.hypotheses,
          adaptationIdeas: creative.analysis.adaptationIdeas,
          targetAudience: creative.analysis.targetAudience,
          ageSignal: creative.analysis.ageSignal,
          audienceReasoning: creative.analysis.audienceReasoning
        }
      : null
  };
}

function sourcePromptRecord(creative: CompetitorCreative) {
  return {
    sourceCreativeId: creative.id,
    competitorName: creative.competitorName,
    adLibraryId: creative.adLibraryId,
    sourceUrl: creative.sourceUrl,
    format: creative.format,
    status: creative.status,
    headline: creative.headline,
    primaryText: creative.primaryText,
    hook: creative.hook,
    cta: creative.cta,
    landingUrl: creative.landingUrl,
    startedAt: creative.startedAt,
    activeDays: creative.activeDays,
    performance: {
      rankingScore: creative.rankingScore,
      reachEstimate: creative.reachEstimate,
      reachMin: creative.reachMin,
      reachMax: creative.reachMax,
      estimatedSpend: creative.estimatedSpend,
      estimatedDailySpend: creative.estimatedDailySpend
    },
    audience: {
      ageRanges: creative.ageRanges,
      genderSignals: creative.genderSignals,
      locations: creative.audienceLocations,
      interests: creative.audienceInterests
    },
    analysis: creative.analysis
      ? {
          hook: creative.analysis.hook,
          hookExplanation: creative.analysis.hookExplanation,
          body: creative.analysis.body,
          ending: creative.analysis.ending,
          angle: creative.analysis.angle,
          thesis: creative.analysis.thesis,
          detectedText: creative.analysis.detectedText,
          offer: creative.analysis.offer,
          funnelStage: creative.analysis.funnelStage,
          emotionScores: creative.analysis.emotionScores,
          strengths: creative.analysis.strengths,
          weaknesses: creative.analysis.weaknesses,
          hypotheses: creative.analysis.hypotheses,
          adaptationIdeas: creative.analysis.adaptationIdeas,
          targetAudience: creative.analysis.targetAudience,
          ageSignal: creative.analysis.ageSignal,
          audienceReasoning: creative.analysis.audienceReasoning
        }
      : null,
    videoTranscript: creative.videoTranscript?.status === "completed" && creative.videoTranscript.transcript
      ? {
          hookTranscript: getHookTranscript(creative.videoTranscript),
          transcript: creative.videoTranscript.transcript.slice(0, 10000),
          durationSeconds: creative.videoTranscript.durationSeconds,
          language: creative.videoTranscript.language
        }
      : null
  };
}

function normalizeGeneratedIterations(payload: JsonRecord): GeneratedCompetitorIteration[] {
  const iterations = Array.isArray(payload.iterations) ? payload.iterations : [];
  return iterations
    .map((iteration) => {
      const record = (iteration && typeof iteration === "object" && !Array.isArray(iteration) ? iteration : {}) as JsonRecord;
      return {
        sourceCreativeId: stringValue(record.sourceCreativeId),
        title: stringValue(record.title),
        angle: stringValue(record.angle),
        description: stringValue(record.description),
        thesis: stringValue(record.thesis) || stringValue(record.these),
        textOverlay: stringValue(record.textOverlay) || stringValue(record.text_overlay) || stringValue(record.overlayText) || stringValue(record.overlay_text),
        hook: stringValue(record.hook),
        script: stringValue(record.script),
        productionNotes: stringValue(record.productionNotes),
        rationale: stringValue(record.rationale),
        score: numberValue(record.score) ?? undefined
      };
    })
    .filter((iteration) => iteration.sourceCreativeId && iteration.title);
}

async function loadBrandProfile(clientId: string): Promise<BrandProfile> {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: profile }, { data: client }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("brand_name,positioning,tone_of_voice,target_audience,pain_points,buying_triggers,usps,offers,forbidden_claims,brand_no_gos,cta_preferences")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase.from("clients").select("name").eq("id", clientId).maybeSingle()
  ]);

  const typedProfile = (profile ?? {}) as Partial<BrandProfileRow>;
  const typedClient = (client ?? {}) as Partial<ClientRow>;
  return {
    brandName: stringValue(typedProfile.brand_name) || stringValue(typedClient.name) || "Viktor Kofler",
    positioning: typedProfile.positioning ?? null,
    toneOfVoice: typedProfile.tone_of_voice ?? null,
    targetAudience: typedProfile.target_audience ?? null,
    painPoints: typedProfile.pain_points ?? null,
    buyingTriggers: typedProfile.buying_triggers ?? null,
    usps: typedProfile.usps ?? null,
    offers: typedProfile.offers ?? null,
    forbiddenClaims: typedProfile.forbidden_claims ?? null,
    brandNoGos: typedProfile.brand_no_gos ?? null,
    ctaPreferences: typedProfile.cta_preferences ?? null
  };
}

async function loadSources(clientId: string, format: CompetitorIterationFormat, dateRange: ResolvedIterationDateRange, limit: number, competitorId?: string | null): Promise<LoadedSources> {
  const overview = await getCompetitorOverview(clientId);
  if (overview.error) throw new Error(overview.error);

  const competitorFiltered = competitorId ? overview.creatives.filter((creative) => creative.competitorId === competitorId) : overview.creatives;
  const dateFiltered = competitorFiltered.filter((creative) => dateMatches(creative, dateRange));
  const formatMatches = dateFiltered.filter((creative) => sourceTypeMatches(creative, format));
  const strictMatches = formatMatches.filter(enoughPerformance);
  const scoreFallbackMatches = formatMatches.filter(fallbackPerformance);
  const performanceFallbackMatches = formatMatches.filter(hasAnyPerformance);
  let selectionMode: SourceSelectionMode = "strict";
  let candidates = strictMatches;

  if (candidates.length === 0) {
    selectionMode = "score_fallback";
    candidates = scoreFallbackMatches;
  }

  if (candidates.length === 0) {
    selectionMode = "performance_fallback";
    candidates = performanceFallbackMatches;
  }

  let transcriptMode: SourceSelectionDiagnostics["transcriptMode"] = "not_required";
  const transcriptMatches = format === "video" ? candidates.filter(hasCompletedTranscript) : [];

  if (format === "video") {
    if (transcriptMatches.length > 0) {
      transcriptMode = "completed_transcript";
      candidates = transcriptMatches;
    } else {
      transcriptMode = "analysis_or_copy_fallback";
      candidates = candidates.filter(hasVideoIterationContext);
    }
  }

  const selected = candidates.sort(sortSourcesByPerformance).slice(0, Math.max(limit, 1));
  const diagnosticsWithoutNote = {
    totalCreatives: overview.creatives.length,
    competitorFilteredCreatives: competitorFiltered.length,
    dateFilteredCreatives: dateFiltered.length,
    formatMatches: formatMatches.length,
    strictMatches: strictMatches.length,
    scoreFallbackMatches: scoreFallbackMatches.length,
    performanceFallbackMatches: performanceFallbackMatches.length,
    selected: selected.length,
    selectionMode,
    transcriptMatches: format === "video" ? transcriptMatches.length : undefined,
    transcriptMode
  };

  return {
    sources: selected,
    diagnostics: {
      ...diagnosticsWithoutNote,
      note: sourceSelectionNote(diagnosticsWithoutNote)
    }
  };
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
      temperature: 0.78
    })
  });
  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "OpenRouter Competitor Iterations Anfrage fehlgeschlagen.");
  return { model, payload, text: textFromContent(payload.choices?.[0]?.message?.content) };
}

function iterationPrompt(input: {
  format: CompetitorIterationFormat;
  count: number;
  brandProfile: BrandProfile;
  sources: CompetitorCreative[];
  dateRange: ResolvedIterationDateRange;
  recentIterations: Array<{ title: string | null; angle: string | null; source_competitor_creative_id: string | null }>;
}) {
  const formatInstruction = input.format === "static"
    ? "Erzeuge Static-Ad-Iterationen ausschliesslich aus Image-/Static-Creatives. Fokus: neue Bildidee, Layout, Text Overlay, Headline und klare Produktionsanweisung."
    : "Erzeuge Video-Ad-Iterationen. Fokus: neue Hook, konkretes Script, Shotlist/Produktionshinweise und klare Ableitung aus dem funktionierenden Competitor Video.";

  return `Erstelle ${input.count} neue ${input.format === "static" ? "Static" : "Video"} Iterationen fuer die Marke ${input.brandProfile.brandName}.

Ziel: Die Gewinner-Mechanik aus echten Competitor Ads adaptieren, aber als eigenstaendige Viktor-Kofler-Brand-Ausfuehrung formulieren.

Zeitraum: ${dateRangeLabel(input.dateRange)}

Brand Kontext JSON:
${JSON.stringify(input.brandProfile, null, 2)}

${formatInstruction}

Competitor Bestperformer Quellen JSON:
${JSON.stringify(input.sources.map(sourcePromptRecord), null, 2)}

Bereits vorhandene Competitor Iterations, nicht wiederholen:
${JSON.stringify(input.recentIterations, null, 2)}

Antworte exakt als JSON Objekt mit Key iterations. Jedes Item braucht:
sourceCreativeId, title, angle, description, thesis, textOverlay, hook, script, productionNotes, rationale, score.

Regeln:
- sourceCreativeId muss exakt eine ID aus den Quellen sein.
- Nicht die Competitor-Marke kopieren oder nennen, ausser in rationale als Herkunft der Mechanik.
- Keine 1:1 Kopie von Hook, Copy, Visual oder Script.
- Uebersetze den psychologischen Mechanismus in eine neue Viktor-Kofler-Ausfuehrung.
- Nutze Brand-Kontext, USPs, Angebote, Zielgruppe und Tonalitaet, wenn vorhanden.
- Erfinde keine harten Claims, Garantien, medizinische Aussagen oder Zahlen, die nicht im Brand-Kontext stehen.
- title ist kurz und produzierbar.
- angle ist ein kurzes Canonical Label, z.B. "Supermarkt vs Handwerk", "Founderstory", "Blindtest", "Preisanker", "Behind the Scenes".
- description erklaert in 1-3 Saetzen, was verbessert oder variiert wird.
- thesis ist eine klare Performance-These: Warum sollte diese neue Ausfuehrung fuer ${input.brandProfile.brandName} funktionieren?
- textOverlay ist bei Static Iterations der konkrete Text im Bild, maximal 8 Woerter.
- productionNotes sind konkrete Produktionsanweisungen.
- rationale erklaert, welcher Competitor-Mechanismus transformiert wurde.
- score ist 0-100.
- Bei Static Iterations duerfen hook und script leer sein, textOverlay und thesis muessen befuellt sein.
- Bei Video Iterations muessen hook und script befuellt sein.
- Wenn bei Video Quellen videoTranscript null ist, nutze Analyse, Hook, Visual Elements, Copy und Performance als Grundlage und erwaehne diese Unsicherheit kurz in rationale.`;
}

function mapIteration(row: CompetitorIterationRow, source: CompetitorCreative | undefined, clientId: string): CompetitorIteration {
  const format = normalizeFormat(row.format);
  const raw = row.raw ?? {};
  const snapshotCreative = row.performance_snapshot?.creative && typeof row.performance_snapshot.creative === "object" ? row.performance_snapshot.creative as JsonRecord : {};
  const sourceCreativeName = source?.headline || source?.primaryText?.slice(0, 80) || stringValue(snapshotCreative.adLibraryId) || row.source_competitor_creative_id;
  const thesis = stringValue(raw.thesis) || stringValue(raw.these) || (format === "static" ? stringValue(row.script) : "");
  const textOverlay =
    stringValue(raw.textOverlay) ||
    stringValue(raw.text_overlay) ||
    stringValue(raw.overlayText) ||
    stringValue(raw.overlay_text) ||
    (format === "static" ? stringValue(row.hook) || stringValue(row.title) : "");

  return {
    id: row.id,
    generationId: row.generation_id,
    sourceCreativeId: row.source_competitor_creative_id,
    sourceCompetitorId: source?.competitorId ?? (stringValue(snapshotCreative.competitorId) || null),
    sourceCompetitorName: source?.competitorName ?? (stringValue(snapshotCreative.competitorName) || "Competitor"),
    sourceCreativeName,
    sourceCreativeType: source?.format ?? (stringValue(snapshotCreative.format) || "unknown"),
    sourceCreativeHref: `/clients/${clientId}/competitors/creatives/${row.source_competitor_creative_id}`,
    sourceCreativeSourceUrl: source?.sourceUrl ?? (stringValue(snapshotCreative.sourceUrl) || null),
    sourceCreativeImageUrl: source?.imageUrl ?? null,
    sourceCreativeThumbnailUrl: source?.thumbnailUrl ?? null,
    sourceCreativeVideoUrl: source?.videoUrl ?? null,
    sourceCreativeLandingUrl: source?.landingUrl ?? (stringValue(snapshotCreative.landingUrl) || null),
    sourceCreativeHeadline: source?.headline ?? null,
    sourceCreativePrimaryText: source?.primaryText ?? null,
    detailHref: `/clients/${clientId}/competitors/iterations/${row.id}`,
    format,
    status: normalizeStatus(row.status),
    title: row.title,
    angle: row.angle,
    description: row.description,
    thesis: thesis || null,
    textOverlay: textOverlay || null,
    hook: row.hook,
    script: row.script,
    productionNotes: row.production_notes,
    rationale: row.rationale,
    score: numberValue(row.score),
    performanceSnapshot: row.performance_snapshot ?? {},
    raw,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getCompetitorIterationDetail(clientId: string, iterationId: string): Promise<{ iteration: CompetitorIteration | null; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("competitor_ad_iterations")
      .select("id,generation_id,source_competitor_creative_id,format,status,title,angle,description,hook,script,production_notes,rationale,score,performance_snapshot,raw,created_at,updated_at")
      .eq("client_id", clientId)
      .eq("id", iterationId)
      .single();

    if (error) return { iteration: null, error: error.message };

    const row = data as CompetitorIterationRow;
    const overview = await getCompetitorOverview(clientId);
    const source = overview.creatives.find((creative) => creative.id === row.source_competitor_creative_id);

    return { iteration: mapIteration(row, source, clientId), error: null };
  } catch (error) {
    return {
      iteration: null,
      error: error instanceof Error ? error.message : "Competitor Iteration konnte nicht geladen werden."
    };
  }
}

async function getCompetitorIterationsOverviewUncached(clientId: string): Promise<CompetitorIterationsOverview> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [{ data: iterationRows, error: iterationsError }, { data: generationRows, error: generationsError }, overview] = await Promise.all([
      supabase
        .from("competitor_ad_iterations")
        .select("id,generation_id,source_competitor_creative_id,format,status,title,angle,description,hook,script,production_notes,rationale,score,performance_snapshot,raw,created_at,updated_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("competitor_ad_iteration_generations")
        .select("id,client_id,generation_key,format,status,period_start,period_end,prompt_context,raw_response,error_message,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(8),
      getCompetitorOverview(clientId)
    ]);

    if (iterationsError) throw new Error(iterationsError.message);
    if (generationsError) throw new Error(generationsError.message);
    if (overview.error) throw new Error(overview.error);

    const rows = (iterationRows ?? []) as CompetitorIterationRow[];
    const creativesById = new Map(overview.creatives.map((creative) => [creative.id, creative]));
    const iterations = rows.map((row) => mapIteration(row, creativesById.get(row.source_competitor_creative_id), clientId));
    const statics = iterations.filter((iteration) => iteration.format === "static" && !iteration.sourceCreativeVideoUrl);
    const videos = iterations.filter((iteration) => iteration.format === "video");

    return {
      statics,
      videos,
      latestGenerations: (generationRows ?? []) as CompetitorGenerationRow[],
      totals: {
        all: statics.length + videos.length,
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
      error: error instanceof Error ? error.message : "Competitor Iterations konnten nicht geladen werden."
    };
  }
}

const getCompetitorIterationsOverviewCached = unstable_cache(
  getCompetitorIterationsOverviewUncached,
  ["competitor-iterations-overview-v1"],
  { revalidate: 120, tags: [CACHE_TAGS.competitorIterations] }
);

export async function getCompetitorIterationsOverview(clientId: string) {
  return getCompetitorIterationsOverviewCached(clientId);
}

async function recentIterations(clientId: string, format: CompetitorIterationFormat) {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("competitor_ad_iterations")
    .select("source_competitor_creative_id,title,angle")
    .eq("client_id", clientId)
    .eq("format", format)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as Array<{ source_competitor_creative_id: string | null; title: string | null; angle: string | null }>;
}

async function generateFormatBatch(clientId: string, format: CompetitorIterationFormat, options: GenerateCompetitorIterationsOptions): Promise<GenerationSummary> {
  const supabase = createSupabaseServiceRoleClient();
  const dateRange = defaultDateRange(options);
  const key = generationKey(options);
  const count = Math.max(1, Math.min(20, Math.floor(options.count ?? 6)));

  const { data: existing } = await supabase
    .from("competitor_ad_iteration_generations")
    .select("id,status")
    .eq("client_id", clientId)
    .eq("generation_key", key)
    .eq("format", format)
    .maybeSingle();

  if (existing) {
    const { count: existingIterationsCount, error: existingIterationsError } = await supabase
      .from("competitor_ad_iterations")
      .select("id", { count: "exact", head: true })
      .eq("generation_id", existing.id);

    if (existingIterationsError) throw new Error(existingIterationsError.message);
    if (existing.status === "running" || Number(existingIterationsCount ?? 0) > 0) {
      return { clientId, format, status: "skipped", created: 0, sourceCount: 0, generationId: existing.id };
    }
  }

  let generation: { id: string } | null = existing ? { id: existing.id } : null;
  const optionsPayload = { ...options, format, count, mode: options.mode ?? "manual" };

  if (generation) {
    const { error: resetError } = await supabase
      .from("competitor_ad_iteration_generations")
      .update({
        model: null,
        status: "running",
        period_start: dateRange.since,
        period_end: dateRange.until,
        options: optionsPayload,
        prompt_context: {},
        raw_response: {},
        error_message: null
      })
      .eq("id", generation.id);

    if (resetError) throw new Error(resetError.message);
  } else {
    const { data: createdGeneration, error: generationError } = await supabase
      .from("competitor_ad_iteration_generations")
      .insert({
        client_id: clientId,
        generation_key: key,
        format,
        status: "running",
        period_start: dateRange.since,
        period_end: dateRange.until,
        options: optionsPayload
      })
      .select("id")
      .single();

    if (generationError || !createdGeneration) throw new Error(generationError?.message ?? "Competitor Iteration Generation konnte nicht erstellt werden.");
    generation = createdGeneration;
  }

  try {
    const [{ sources, diagnostics }, existingIterations, brandProfile] = await Promise.all([
      loadSources(clientId, format, dateRange, count, options.competitorId ?? null),
      recentIterations(clientId, format),
      loadBrandProfile(clientId)
    ]);

    const promptContext = {
      format,
      dateRange,
      brandProfile,
      competitorId: options.competitorId ?? null,
      sourceCount: sources.length,
      sourceDiagnostics: diagnostics,
      sourceSelectionNote: diagnostics.note,
      sources: sources.map(sourcePromptRecord),
      recentIterations: existingIterations
    };

    if (sources.length === 0) {
      await supabase
        .from("competitor_ad_iteration_generations")
        .update({ status: "completed", model: null, prompt_context: promptContext, raw_response: { iterations: [], note: diagnostics.note } })
        .eq("id", generation.id);
      revalidateCacheTags(CACHE_TAGS.competitorIterations);
      return { clientId, format, status: "completed", created: 0, sourceCount: 0, generationId: generation.id };
    }

    const { model, payload, text } = await callOpenRouter(iterationPrompt({ format, count, brandProfile, sources, dateRange, recentIterations: existingIterations }));
    const generated = normalizeGeneratedIterations(extractJsonObject(text));
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const fallbackSources = sources.slice();
    const insertRows = generated.slice(0, count).map((iteration, index) => {
      const source = sourcesById.get(iteration.sourceCreativeId) ?? fallbackSources[index % fallbackSources.length];
      return {
        client_id: clientId,
        generation_id: generation.id,
        source_competitor_creative_id: source.id,
        format,
        status: "new",
        title: iteration.title,
        angle: iteration.angle || null,
        description: iteration.description || null,
        hook: format === "static" ? iteration.textOverlay || iteration.hook || null : iteration.hook || null,
        script: format === "static" ? iteration.thesis || iteration.script || null : iteration.script || null,
        production_notes: iteration.productionNotes || null,
        rationale: iteration.rationale || null,
        score: iteration.score ?? null,
        performance_snapshot: performanceSnapshot(source),
        raw: iteration as unknown as JsonRecord
      };
    });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase.from("competitor_ad_iterations").insert(insertRows);
      if (insertError) throw new Error(insertError.message);
    }

    await supabase
      .from("competitor_ad_iteration_generations")
      .update({ status: "completed", model, prompt_context: promptContext, raw_response: { payload: payload as unknown as JsonRecord, generatedIterations: insertRows.length } })
      .eq("id", generation.id);

    revalidateCacheTags(CACHE_TAGS.competitorIterations);
    return { clientId, format, status: "completed", created: insertRows.length, sourceCount: sources.length, generationId: generation.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor Iteration Generation fehlgeschlagen.";
    await supabase
      .from("competitor_ad_iteration_generations")
      .update({ status: "failed", error_message: message, raw_response: { error: message } })
      .eq("id", generation.id);
    revalidateCacheTags(CACHE_TAGS.competitorIterations);
    return { clientId, format, status: "failed", created: 0, sourceCount: 0, generationId: generation.id, error: message };
  }
}

export async function generateCompetitorIterations(clientId: string, options: GenerateCompetitorIterationsOptions = {}) {
  const format = normalizeGenerateFormat(options.format ?? "all");
  const formats: CompetitorIterationFormat[] = format === "all" ? ["static", "video"] : [format];
  const summaries: GenerationSummary[] = [];

  for (const targetFormat of formats) {
    summaries.push(await generateFormatBatch(clientId, targetFormat, { ...options, format: targetFormat }));
  }

  return {
    summaries,
    overview: await getCompetitorIterationsOverview(clientId)
  };
}

export async function updateCompetitorIterationStatus(clientId: string, iterationId: string, status: string) {
  const nextStatus = normalizeStatus(status);
  if (nextStatus !== status) throw new Error("Ungueltiger Iteration Status.");
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("competitor_ad_iterations")
    .update({ status: nextStatus })
    .eq("client_id", clientId)
    .eq("id", iterationId);
  if (error) throw new Error(error.message);
  revalidateCacheTags(CACHE_TAGS.competitorIterations);
  return getCompetitorIterationsOverview(clientId);
}

export function competitorIterationPerformanceLine(iteration: CompetitorIteration) {
  const metrics = iteration.performanceSnapshot.metrics as JsonRecord | undefined;
  if (!metrics) return "Keine Performance Snapshot Daten";
  return [
    `Reach ${formatNumber(Number(metrics.reachEstimate ?? 0))}`,
    `Spend ${formatCurrency(Number(metrics.estimatedSpend ?? 0))}`,
    `Score ${formatNumber(Number(metrics.rankingScore ?? 0))}/100`
  ].join(" · ");
}
