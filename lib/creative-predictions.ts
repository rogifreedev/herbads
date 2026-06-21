import "server-only";

import { getCompetitorOverview } from "@/lib/competitors";
import { getCreativeAnglesOverview, type AngleInsight } from "@/lib/creative-angles";
import { listClientCreatives } from "@/lib/creatives";
import { getOptionalEnv } from "@/lib/env";
import { aggregateInsightRows } from "@/lib/metrics";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getHookTranscript, transcribeUploadedVideoFile, type CreativeVideoTranscript, type TranscriptSegment } from "@/lib/video-transcripts";

type JsonRecord = Record<string, unknown>;

type ProfileRow = {
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

type OpenRouterMessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
};

type PredictionInput = {
  format: "static" | "video";
  file: File;
  frames: Array<{ label: string; dataUrl: string; timeSeconds?: number | null }>;
  primaryText?: string | null;
  headline?: string | null;
  landingUrl?: string | null;
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

type PredictionAiResult = {
  summary: string;
  format: "static" | "video";
  angle: string;
  hook: string;
  script: string;
  detectedText: string;
  targetAudienceFitScore: number | null;
  brandFitScore: number | null;
  clarityScore: number | null;
  scrollstopperScore: number | null;
  ctaScore: number | null;
  offerStrengthScore: number | null;
  trustScore: number | null;
  thumbstopReason: string;
  conversionReason: string;
  risks: string[];
  strengths: string[];
  recommendations: string[];
  emotionScores: {
    curiosity: number | null;
    desire: number | null;
    trust: number | null;
    urgency: number | null;
    joy: number | null;
    fearOfMissingOut: number | null;
  };
};

export type CreativePredictionResult = {
  qualityScore: number;
  confidence: number;
  band: "high" | "medium" | "low";
  format: "static" | "video";
  fileName: string;
  fileSize: number;
  angle: string;
  hook: string | null;
  script: string | null;
  transcript: string | null;
  transcriptMeta: {
    provider: string;
    model: string;
    language: string | null;
    durationSeconds: number | null;
    segments: TranscriptSegment[];
  } | null;
  ai: PredictionAiResult;
  components: {
    aiQuality: number;
    accountFit: number;
    competitorFit: number;
    formatReadiness: number;
    riskAdjustment: number;
  };
  benchmarks: {
    account: {
      creativeCount: number;
      analyzedCreativeCount: number;
      avgScore: number;
      winnerScore: number;
      spend: number;
      impressions: number;
      purchases: number;
      ctr: number | null;
      hookRate: number | null;
      holdRate: number | null;
      roas: number | null;
    };
    matchedAngle: {
      angle: string;
      score: number;
      creativeCount: number;
      spend: number;
      impressions: number;
      ctr: number | null;
      hookRate: number | null;
      outboundCvr: number | null;
    } | null;
    competitor: {
      matchedAngle: string | null;
      score: number;
      creativeCount: number;
      reach: number;
      spend: number;
      examples: Array<{ id: string; competitorName: string; angle: string | null; reach: number | null; spend: number | null; rankingScore: number }>;
    };
  };
  rationale: string[];
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function weightedAverage(items: Array<{ value: number | null; weight: number }>) {
  const valid = items.filter((item) => item.value !== null);
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (weightSum === 0) return 0;
  return valid.reduce((sum, item) => sum + (item.value ?? 0) * item.weight, 0) / weightSum;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function textFromContent(content: string | Array<{ text?: string }> | undefined) {
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

function normalizeScore(value: unknown) {
  const score = toNumber(value);
  return score === null ? null : clamp(score);
}

function normalizeEmotionScores(value: unknown): PredictionAiResult["emotionScores"] {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  return {
    curiosity: normalizeScore(record.curiosity),
    desire: normalizeScore(record.desire),
    trust: normalizeScore(record.trust),
    urgency: normalizeScore(record.urgency),
    joy: normalizeScore(record.joy),
    fearOfMissingOut: normalizeScore(record.fearOfMissingOut)
  };
}

function normalizeAiResult(value: JsonRecord, fallbackFormat: "static" | "video"): PredictionAiResult {
  return {
    summary: stringValue(value.summary),
    format: value.format === "video" ? "video" : fallbackFormat,
    angle: stringValue(value.angle) || "Unklar",
    hook: stringValue(value.hook),
    script: stringValue(value.script),
    detectedText: stringValue(value.detectedText),
    targetAudienceFitScore: normalizeScore(value.targetAudienceFitScore),
    brandFitScore: normalizeScore(value.brandFitScore),
    clarityScore: normalizeScore(value.clarityScore),
    scrollstopperScore: normalizeScore(value.scrollstopperScore),
    ctaScore: normalizeScore(value.ctaScore),
    offerStrengthScore: normalizeScore(value.offerStrengthScore),
    trustScore: normalizeScore(value.trustScore),
    thumbstopReason: stringValue(value.thumbstopReason),
    conversionReason: stringValue(value.conversionReason),
    risks: stringArray(value.risks),
    strengths: stringArray(value.strengths),
    recommendations: stringArray(value.recommendations),
    emotionScores: normalizeEmotionScores(value.emotionScores)
  };
}

function tokens(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9äöüß]+/gi, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

function similarity(left: string | null | undefined, right: string | null | undefined) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size);
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

  const typedProfile = (profile ?? {}) as Partial<ProfileRow>;
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

async function loadAccountBenchmarks(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const [{ creatives }, angles, { data: insightRows }] = await Promise.all([
    listClientCreatives(clientId),
    getCreativeAnglesOverview(clientId),
    supabase
      .from("creative_insights_daily")
      .select("spend,impressions,reach,clicks,link_clicks,outbound_clicks,purchases,purchase_value,engagement,video_3s_views,thruplays")
      .eq("client_id", clientId)
  ]);
  const metrics = aggregateInsightRows((insightRows ?? []) as InsightRow[]);
  const scoredCreatives = creatives.map((creative) => creative.performanceScore.score);
  const avgScore = scoredCreatives.length > 0 ? Math.round(scoredCreatives.reduce((sum, score) => sum + score, 0) / scoredCreatives.length) : 0;
  const winnerScore = scoredCreatives.length > 0 ? Math.round([...scoredCreatives].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(scoredCreatives.length * 0.2))).reduce((sum, score) => sum + score, 0) / Math.max(1, Math.ceil(scoredCreatives.length * 0.2))) : 0;

  return {
    creatives,
    angles: angles.angles,
    metrics,
    account: {
      creativeCount: creatives.length,
      analyzedCreativeCount: creatives.filter((creative) => creative.hasAiAnalysis).length,
      avgScore,
      winnerScore,
      spend: metrics.spend,
      impressions: metrics.impressions,
      purchases: metrics.purchases,
      ctr: metrics.ctr,
      hookRate: metrics.hookRate,
      holdRate: metrics.holdRate,
      roas: metrics.roas
    }
  };
}

function matchAngle(angle: string, angles: AngleInsight[]) {
  const exact = angles.find((item) => item.angle.toLowerCase() === angle.toLowerCase());
  if (exact) return exact;
  return angles
    .map((item) => ({ item, score: similarity(item.angle, angle) }))
    .filter((match) => match.score > 0.12)
    .sort((a, b) => b.score - a.score || b.item.score - a.item.score)[0]?.item ?? null;
}

async function loadCompetitorBenchmarks(clientId: string, angle: string) {
  const overview = await getCompetitorOverview(clientId);
  const candidates = overview.creatives
    .filter((creative) => creative.analysis || creative.reachEstimate || creative.estimatedSpend)
    .map((creative) => ({
      creative,
      angle: creative.analysis?.angle ?? null,
      match: Math.max(similarity(creative.analysis?.angle, angle), similarity(creative.analysis?.body, angle), similarity(creative.primaryText, angle), similarity(creative.headline, angle))
    }))
    .filter((item) => item.match > 0.1 || item.creative.rankingScore >= 65)
    .sort((a, b) => b.match - a.match || b.creative.rankingScore - a.creative.rankingScore || (b.creative.reachEstimate ?? 0) - (a.creative.reachEstimate ?? 0))
    .slice(0, 8);
  const reach = candidates.reduce((sum, item) => sum + (item.creative.reachEstimate ?? 0), 0);
  const spend = candidates.reduce((sum, item) => sum + (item.creative.estimatedSpend ?? 0), 0);
  const avgRanking = candidates.length > 0 ? candidates.reduce((sum, item) => sum + item.creative.rankingScore, 0) / candidates.length : 0;
  const matchBoost = candidates.length > 0 ? Math.min(20, candidates[0].match * 35) : 0;

  return {
    matchedAngle: candidates[0]?.angle ?? null,
    score: clamp(avgRanking + matchBoost),
    creativeCount: candidates.length,
    reach,
    spend,
    examples: candidates.slice(0, 4).map((item) => ({
      id: item.creative.id,
      competitorName: item.creative.competitorName,
      angle: item.angle,
      reach: item.creative.reachEstimate,
      spend: item.creative.estimatedSpend,
      rankingScore: item.creative.rankingScore
    }))
  };
}

function transcriptToPrediction(transcription: Awaited<ReturnType<typeof transcribeUploadedVideoFile>>): CreativeVideoTranscript {
  const now = new Date().toISOString();
  return {
    id: "prediction-upload-transcript",
    provider: transcription.provider,
    model: transcription.model,
    status: "completed",
    language: transcription.language,
    transcript: transcription.text,
    segments: transcription.segments,
    durationSeconds: transcription.duration,
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  };
}

function transcriptSections(transcript: CreativeVideoTranscript | null) {
  if (!transcript?.transcript) return null;
  const words = transcript.transcript.trim().split(/\s+/).filter(Boolean);
  if (transcript.segments.length > 0 && transcript.durationSeconds) {
    const duration = transcript.durationSeconds;
    const hook = transcript.segments.filter((segment) => (segment.start ?? 0) <= Math.min(5, duration * 0.18)).map((segment) => segment.text).join(" ");
    const body = transcript.segments.filter((segment) => (segment.start ?? 0) > Math.min(5, duration * 0.18) && (segment.start ?? 0) < duration * 0.82).map((segment) => segment.text).join(" ");
    const ending = transcript.segments.filter((segment) => (segment.start ?? 0) >= duration * 0.82).map((segment) => segment.text).join(" ");
    return { hook, body, ending };
  }

  return {
    hook: words.slice(0, 45).join(" "),
    body: words.slice(45, Math.max(45, words.length - 35)).join(" "),
    ending: words.slice(-35).join(" ")
  };
}

function aiQualityScore(ai: PredictionAiResult) {
  return clamp(weightedAverage([
    { value: ai.scrollstopperScore, weight: 22 },
    { value: ai.targetAudienceFitScore, weight: 20 },
    { value: ai.brandFitScore, weight: 16 },
    { value: ai.clarityScore, weight: 14 },
    { value: ai.offerStrengthScore, weight: 12 },
    { value: ai.ctaScore, weight: 10 },
    { value: ai.trustScore, weight: 6 }
  ]));
}

function formatReadinessScore(input: { format: "static" | "video"; transcript: CreativeVideoTranscript | null; frames: PredictionInput["frames"]; ai: PredictionAiResult }) {
  let score = 68;
  if (input.frames.length > 0) score += 10;
  if (input.format === "video") {
    if (input.transcript?.transcript) score += 16;
    if (input.ai.hook) score += 6;
    if (input.ai.script) score += 4;
  } else {
    if (input.ai.detectedText || input.ai.hook) score += 12;
    if (input.ai.ctaScore !== null) score += 4;
  }
  return clamp(score);
}

function riskAdjustment(ai: PredictionAiResult) {
  const riskPenalty = Math.min(18, ai.risks.length * 4);
  const strengthBoost = Math.min(10, ai.strengths.length * 2);
  return clamp(50 - riskPenalty + strengthBoost);
}

function predictionBand(score: number): CreativePredictionResult["band"] {
  if (score >= 75) return "high";
  if (score >= 58) return "medium";
  return "low";
}

function confidenceScore(input: { account: Awaited<ReturnType<typeof loadAccountBenchmarks>>["account"]; competitor: CreativePredictionResult["benchmarks"]["competitor"]; transcript: CreativeVideoTranscript | null; frames: PredictionInput["frames"]; matchedAngle: AngleInsight | null }) {
  return clamp(
    20 +
    Math.min(input.account.creativeCount, 40) * 0.7 +
    Math.min(input.account.spend / 250, 20) +
    Math.min(input.account.impressions / 5000, 15) +
    (input.matchedAngle ? Math.min(input.matchedAngle.creativeCount, 10) * 2 : 0) +
    Math.min(input.competitor.creativeCount, 8) * 2 +
    (input.transcript?.transcript ? 8 : 0) +
    Math.min(input.frames.length, 4) * 2
  );
}

function buildPrompt(input: {
  upload: PredictionInput;
  brandProfile: BrandProfile;
  account: Awaited<ReturnType<typeof loadAccountBenchmarks>>;
  transcript: CreativeVideoTranscript | null;
}) {
  const topAngles = input.account.angles.slice(0, 10).map((angle) => ({
    angle: angle.angle,
    score: angle.score,
    creativeCount: angle.creativeCount,
    spend: Math.round(angle.spend),
    impressions: Math.round(angle.impressions),
    ctr: angle.ctr,
    hookRate: angle.hookRate,
    outboundCvr: angle.outboundCvr,
    topHooks: angle.topHooks
  }));
  const sections = transcriptSections(input.transcript);

  return `Bewerte ein neu hochgeladenes ${input.upload.format === "video" ? "Video" : "Static"} Creative als Prediction Tool fuer Meta Ads.

Marke / Kunde JSON:
${JSON.stringify(input.brandProfile, null, 2)}

Upload Kontext:
${JSON.stringify({
  fileName: input.upload.file.name,
  fileType: input.upload.file.type,
  fileSize: input.upload.file.size,
  format: input.upload.format,
  primaryText: input.upload.primaryText,
  headline: input.upload.headline,
  landingUrl: input.upload.landingUrl
}, null, 2)}

Video Transcript Kontext:
${JSON.stringify(input.transcript ? {
  hookTranscript: getHookTranscript(input.transcript),
  sections,
  fullTranscript: input.transcript.transcript?.slice(0, 12000),
  durationSeconds: input.transcript.durationSeconds,
  language: input.transcript.language
} : null, null, 2)}

Viktor-Kofler-Account Benchmarks:
${JSON.stringify({
  account: input.account.account,
  topAngles
}, null, 2)}

Bewerte anhand der Frames/Bilder, Copy, Transcript, Brand-Kontext und historischen Account-Mustern. Antworte exakt als JSON Objekt mit:
summary, format, angle, hook, script, detectedText, targetAudienceFitScore, brandFitScore, clarityScore, scrollstopperScore, ctaScore, offerStrengthScore, trustScore, thumbstopReason, conversionReason, risks, strengths, recommendations, emotionScores.

Regeln:
- Scores sind 0-100.
- angle ist ein kurzes Canonical Label wie "Supermarkt vs Handwerk", "Founderstory", "Blindtest", "UGC Proof", "Produktbeweis", "Preisanker".
- Bei Video MUSS hook aus dem Transcript/Opening abgeleitet werden. script ist eine kompakte Struktur des gesprochenen Scripts.
- Bei Static ist hook der Text-Overlay/erste visuelle Einstieg.
- Nutze keine erfundenen Performance-Zahlen.
- Risiken und Empfehlungen kurz, konkret, deutsch.
- Wenn Transcript fehlt, markiere das als Risiko.`;
}

async function callOpenRouterPrediction(input: {
  upload: PredictionInput;
  brandProfile: BrandProfile;
  account: Awaited<ReturnType<typeof loadAccountBenchmarks>>;
  transcript: CreativeVideoTranscript | null;
}) {
  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY fehlt.");

  const model = getOptionalEnv("OPENROUTER_VISION_MODEL", getOptionalEnv("OPENROUTER_TEXT_MODEL", "openai/gpt-5.2"));
  const prompt = buildPrompt(input);
  const images = input.upload.frames.slice(0, 4).filter((frame) => frame.dataUrl.startsWith("data:image/"));
  const content: OpenRouterMessageContent = images.length > 0
    ? [
        { type: "text", text: prompt },
        ...images.map((frame) => ({ type: "image_url" as const, image_url: { url: frame.dataUrl } }))
      ]
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
        {
          role: "system",
          content: "Du bist ein Senior Performance-Creative-Strategist. Du bewertest Creatives als Pre-Launch Prediction anhand Brand Fit, Hook, Visual, Script, Meta-Benchmarks und Competitor-Signalen. Antworte nur mit validem JSON."
        },
        { role: "user", content }
      ],
      temperature: 0.35
    })
  });
  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "OpenRouter Prediction Anfrage fehlgeschlagen.");

  const responseText = textFromContent(payload.choices?.[0]?.message?.content);
  if (!responseText.trim()) throw new Error("OpenRouter Antwort war leer.");
  return normalizeAiResult(extractJsonObject(responseText), input.upload.format);
}

function matchedAngleBenchmark(angle: AngleInsight | null) {
  if (!angle) return null;
  return {
    angle: angle.angle,
    score: angle.score,
    creativeCount: angle.creativeCount,
    spend: angle.spend,
    impressions: angle.impressions,
    ctr: angle.ctr,
    hookRate: angle.hookRate,
    outboundCvr: angle.outboundCvr
  };
}

function accountFitScore(matchedAngle: AngleInsight | null, accountAvgScore: number) {
  if (matchedAngle) return clamp(matchedAngle.score);
  return clamp(accountAvgScore || 50);
}

export async function predictUploadedCreative(clientId: string, input: PredictionInput): Promise<CreativePredictionResult> {
  const [brandProfile, account] = await Promise.all([
    loadBrandProfile(clientId),
    loadAccountBenchmarks(clientId)
  ]);

  let transcript: CreativeVideoTranscript | null = null;
  if (input.format === "video") {
    const transcription = await transcribeUploadedVideoFile(input.file);
    transcript = transcriptToPrediction(transcription);
  }

  const ai = await callOpenRouterPrediction({ upload: input, brandProfile, account, transcript });
  const matchedAngle = matchAngle(ai.angle, account.angles);
  const competitor = await loadCompetitorBenchmarks(clientId, ai.angle);
  const components = {
    aiQuality: aiQualityScore(ai),
    accountFit: accountFitScore(matchedAngle, account.account.avgScore),
    competitorFit: competitor.score,
    formatReadiness: formatReadinessScore({ format: input.format, transcript, frames: input.frames, ai }),
    riskAdjustment: riskAdjustment(ai)
  };
  const score = clamp(weightedAverage([
    { value: components.aiQuality, weight: 42 },
    { value: components.accountFit, weight: 24 },
    { value: components.competitorFit || null, weight: 14 },
    { value: components.formatReadiness, weight: 12 },
    { value: components.riskAdjustment, weight: 8 }
  ]));
  const confidence = confidenceScore({ account: account.account, competitor, transcript, frames: input.frames, matchedAngle });

  return {
    qualityScore: score,
    confidence,
    band: predictionBand(score),
    format: input.format,
    fileName: input.file.name,
    fileSize: input.file.size,
    angle: ai.angle,
    hook: ai.hook || getHookTranscript(transcript),
    script: ai.script || transcriptSections(transcript)?.body || null,
    transcript: transcript?.transcript ?? null,
    transcriptMeta: transcript
      ? {
          provider: transcript.provider,
          model: transcript.model,
          language: transcript.language,
          durationSeconds: transcript.durationSeconds,
          segments: transcript.segments
        }
      : null,
    ai,
    components,
    benchmarks: {
      account: account.account,
      matchedAngle: matchedAngleBenchmark(matchedAngle),
      competitor
    },
    rationale: [
      `AI Creative Quality: ${components.aiQuality}/100 aus Hook, Brand Fit, Klarheit, Scrollstopper, Offer und CTA.`,
      matchedAngle ? `Historischer Viktor-Kofler-Angle-Match: ${matchedAngle.angle} mit Score ${matchedAngle.score}/100.` : `Kein starker historischer Angle-Match, Fallback auf Account-Schnitt ${account.account.avgScore}/100.`,
      competitor.creativeCount > 0 ? `Competitor-Signal: ${competitor.creativeCount} passende Creatives mit geschaetzter Reach ${Math.round(competitor.reach)}.` : "Kein starkes Competitor-Pattern zum Angle gefunden.",
      input.format === "video" && transcript?.transcript ? "Video wurde transkribiert; Hook und Script fliessen aus dem Transcript ein." : "Static/Visual wurde anhand der hochgeladenen Frames und Copy bewertet."
    ]
  };
}
