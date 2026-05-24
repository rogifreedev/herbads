import "server-only";

import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { aggregateInsightRows } from "@/lib/metrics";
import { getHookTranscript, getLatestCreativeVideoTranscript, type CreativeVideoTranscript } from "@/lib/video-transcripts";

type JsonRecord = Record<string, unknown>;

type CreativeRow = {
  id: string;
  client_id: string;
  meta_creative_id: string;
  creative_type: string | null;
  name: string | null;
  title: string | null;
  body: string | null;
  call_to_action_type: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  landing_url: string | null;
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
  competitors: string | null;
  cta_preferences: string | null;
};

type KnowledgeChunkRow = {
  content: string;
  chunk_index: number;
  metadata: JsonRecord | null;
};

type OpenRouterMessageContent = string | Array<{ type?: string; text?: string }> | undefined;

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: OpenRouterMessageContent;
    };
  }>;
  error?: { message?: string };
};

export type CreativeAiAnalysis = {
  id: string;
  model: string;
  status: string;
  summary: string | null;
  creativeType: string | null;
  funnelStage: string | null;
  funnelReason: string | null;
  visualElements: JsonRecord;
  detectedText: string | null;
  hook: string | null;
  hookExplanation: string | null;
  videoStructure: CreativeVideoStructure | null;
  targetAudienceFitScore: number | null;
  brandFitScore: number | null;
  clarityScore: number | null;
  scrollstopperScore: number | null;
  ctaScore: number | null;
  risks: string[];
  hypotheses: string[];
  recommendations: string[];
  emotionScores: CreativeEmotionScores;
  createdAt: string;
};

export type CreativeVideoStructure = {
  hook: { text: string; analysis: string; score: number | null };
  body: { text: string; analysis: string; score: number | null };
  ending: { text: string; analysis: string; score: number | null };
};

export type CreativeEmotionScores = {
  curiosity: number | null;
  desire: number | null;
  trust: number | null;
  urgency: number | null;
  joy: number | null;
  fearOfMissingOut: number | null;
};

type CreativeAiAnalysisRow = {
  id: string;
  model: string;
  status: string;
  summary: string | null;
  creative_type: string | null;
  funnel_stage: string | null;
  funnel_reason: string | null;
  visual_elements: JsonRecord | null;
  detected_text: string | null;
  hook: string | null;
  target_audience_fit_score: number | string | null;
  brand_fit_score: number | string | null;
  clarity_score: number | string | null;
  scrollstopper_score: number | string | null;
  cta_score: number | string | null;
  risks: unknown;
  hypotheses: unknown;
  raw: JsonRecord | null;
  created_at: string;
};

type GeneratedAnalysis = {
  summary: string;
  creativeType: string;
  funnelStage: string | null;
  funnelReason: string;
  visualElements: JsonRecord;
  detectedText: string;
  hook: string;
  hookExplanation: string;
  videoStructure: CreativeVideoStructure | null;
  targetAudienceFitScore: number | null;
  brandFitScore: number | null;
  clarityScore: number | null;
  scrollstopperScore: number | null;
  ctaScore: number | null;
  risks: string[];
  hypotheses: string[];
  recommendations: string[];
  emotionScores: CreativeEmotionScores;
};

const emptyEmotionScores: CreativeEmotionScores = {
  curiosity: null,
  desire: null,
  trust: null,
  urgency: null,
  joy: null,
  fearOfMissingOut: null
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value: unknown) {
  const score = toNumber(value);
  if (score === null) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizeHook(value: unknown) {
  const hook = stringValue(value);
  if (!hook) return "";

  const quoted = hook.match(/[„\"]([^„“\"]{2,90})[“\"]/)?.[1]?.trim();
  if (quoted) return quoted;

  const firstSentence = hook.split(/(?<=[.!?])\s+/)[0]?.trim() ?? hook;
  if (firstSentence.length <= 120) return firstSentence;
  return `${firstSentence.slice(0, 117).trim()}...`;
}

function normalizeHookForSource(value: unknown, creativeType: unknown) {
  const hook = normalizeHook(value);
  const type = stringValue(creativeType).toLowerCase();

  if (!hook) return "";
  if (/hook-risiko|kein video-transcript|keine bewertung|visueller hook|on-screen-text|wirkt abgeschnitten/i.test(hook)) return "";
  if ((type === "image" || type === "static" || type === "post") && hook.length > 120) return "";
  return hook;
}

function normalizeFunnelStage(value: unknown) {
  const stage = stringValue(value).toUpperCase();
  if (stage === "TOFU" || stage === "MOFU" || stage === "BOFU") return stage;
  return null;
}

function normalizeEmotionScores(value: unknown): CreativeEmotionScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyEmotionScores;
  const scores = value as JsonRecord;

  return {
    curiosity: clampScore(scores.curiosity),
    desire: clampScore(scores.desire),
    trust: clampScore(scores.trust),
    urgency: clampScore(scores.urgency),
    joy: clampScore(scores.joy),
    fearOfMissingOut: clampScore(scores.fearOfMissingOut)
  };
}

function normalizeVideoStructure(value: unknown): CreativeVideoStructure | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonRecord;

  function section(key: string) {
    const rawSection = record[key];
    const sectionRecord = rawSection && typeof rawSection === "object" && !Array.isArray(rawSection) ? (rawSection as JsonRecord) : {};
    return {
      text: stringValue(sectionRecord.text),
      analysis: stringValue(sectionRecord.analysis),
      score: clampScore(sectionRecord.score)
    };
  }

  const normalized = {
    hook: section("hook"),
    body: section("body"),
    ending: section("ending")
  };

  return normalized.hook.text || normalized.body.text || normalized.ending.text ? normalized : null;
}

function textFromContent(content: OpenRouterMessageContent) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item.text ?? "").join("\n");
  return "";
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("OpenRouter Antwort enthielt kein JSON Objekt.");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as JsonRecord;
}

function mapAnalysis(row: CreativeAiAnalysisRow): CreativeAiAnalysis {
  return {
    id: row.id,
    model: row.model,
    status: row.status,
    summary: row.summary,
    creativeType: row.creative_type,
    funnelStage: row.funnel_stage,
    funnelReason: row.funnel_reason,
    visualElements: row.visual_elements ?? {},
    detectedText: row.detected_text,
    hook: row.hook,
    hookExplanation: stringValue(row.raw?.hookExplanation),
    videoStructure: normalizeVideoStructure(row.raw?.videoStructure),
    targetAudienceFitScore: toNumber(row.target_audience_fit_score),
    brandFitScore: toNumber(row.brand_fit_score),
    clarityScore: toNumber(row.clarity_score),
    scrollstopperScore: toNumber(row.scrollstopper_score),
    ctaScore: toNumber(row.cta_score),
    risks: stringArray(row.risks),
    hypotheses: stringArray(row.hypotheses),
    recommendations: stringArray(row.raw?.recommendations),
    emotionScores: normalizeEmotionScores(row.raw?.emotionScores),
    createdAt: row.created_at
  };
}

function normalizeGeneratedAnalysis(payload: JsonRecord): GeneratedAnalysis {
  const visualElements = payload.visualElements && typeof payload.visualElements === "object" && !Array.isArray(payload.visualElements) ? (payload.visualElements as JsonRecord) : {};

  return {
    summary: stringValue(payload.summary),
    creativeType: stringValue(payload.creativeType),
    funnelStage: normalizeFunnelStage(payload.funnelStage),
    funnelReason: stringValue(payload.funnelReason),
    visualElements,
    detectedText: stringValue(payload.detectedText),
    hook: normalizeHookForSource(payload.hook, payload.creativeType),
    hookExplanation: stringValue(payload.hookExplanation),
    videoStructure: normalizeVideoStructure(payload.videoStructure),
    targetAudienceFitScore: clampScore(payload.targetAudienceFitScore),
    brandFitScore: clampScore(payload.brandFitScore),
    clarityScore: clampScore(payload.clarityScore),
    scrollstopperScore: clampScore(payload.scrollstopperScore),
    ctaScore: clampScore(payload.ctaScore),
    risks: stringArray(payload.risks),
    hypotheses: stringArray(payload.hypotheses),
    recommendations: stringArray(payload.recommendations),
    emotionScores: normalizeEmotionScores(payload.emotionScores)
  };
}

function profileContext(profile: ProfileRow | null) {
  if (!profile) return "Kein Kundenprofil gespeichert.";

  return [
    ["Brand", profile.brand_name],
    ["Positionierung", profile.positioning],
    ["Tone of Voice", profile.tone_of_voice],
    ["Zielgruppe", profile.target_audience],
    ["Pain Points", profile.pain_points],
    ["Buying Triggers", profile.buying_triggers],
    ["USPs", profile.usps],
    ["Angebote", profile.offers],
    ["Verbotene Claims", profile.forbidden_claims],
    ["Brand No-Gos", profile.brand_no_gos],
    ["Wettbewerber", profile.competitors],
    ["CTA Praeferenzen", profile.cta_preferences]
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n");
}

function knowledgeContext(chunks: KnowledgeChunkRow[]) {
  let usedCharacters = 0;
  const maxCharacters = 16000;
  const parts: string[] = [];

  for (const chunk of chunks) {
    const title = typeof chunk.metadata?.document_title === "string" ? chunk.metadata.document_title : "Wissensdokument";
    const next = `Quelle: ${title}, Chunk ${chunk.chunk_index + 1}\n${chunk.content.trim()}`;
    if (usedCharacters + next.length > maxCharacters) break;
    parts.push(next);
    usedCharacters += next.length;
  }

  return parts.join("\n\n---\n\n") || "Keine weiteren Wissensdatenbank-Auszüge vorhanden.";
}

function truncateText(value: string, maxCharacters = 8000) {
  return value.length > maxCharacters ? `${value.slice(0, maxCharacters)}...` : value;
}

function getTranscriptSection(transcript: CreativeVideoTranscript, section: "hook" | "body" | "ending") {
  const completedSegments = transcript.segments.filter((segment) => segment.text.trim());
  if (completedSegments.length > 0 && transcript.durationSeconds) {
    const duration = transcript.durationSeconds;
    const hookEnd = Math.min(5, duration * 0.2);
    const endingStart = Math.max(hookEnd, duration - Math.min(5, duration * 0.2));
    const selected = completedSegments.filter((segment) => {
      const start = segment.start ?? 0;
      if (section === "hook") return start < hookEnd;
      if (section === "ending") return start >= endingStart;
      return start >= hookEnd && start < endingStart;
    });
    const text = selected.map((segment) => segment.text).join(" ").trim();
    if (text) return text;
  }

  const words = transcript.transcript?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return "";
  const hookWords = Math.min(45, Math.ceil(words.length * 0.2));
  const endingWords = Math.min(45, Math.ceil(words.length * 0.2));
  if (section === "hook") return words.slice(0, hookWords).join(" ");
  if (section === "ending") return words.slice(-endingWords).join(" ");
  return words.slice(hookWords, Math.max(hookWords, words.length - endingWords)).join(" ");
}

function creativeContext(creative: CreativeRow, insights: InsightRow[], transcript: CreativeVideoTranscript | null) {
  const metrics = aggregateInsightRows(insights);
  const hasTranscript = transcript?.status === "completed" && Boolean(transcript.transcript);

  return JSON.stringify(
    {
      metaCreativeId: creative.meta_creative_id,
      type: creative.creative_type,
      name: creative.name,
      title: creative.title,
      body: creative.body,
      cta: creative.call_to_action_type,
      landingUrl: creative.landing_url,
      videoId: creative.video_id,
      metrics: {
        spend: metrics.spend,
        impressions: metrics.impressions,
        reach: metrics.reach,
        frequency: metrics.frequency,
        clicks: metrics.clicks,
        linkClicks: metrics.linkClicks,
        outboundClicks: metrics.outboundClicks,
        purchases: metrics.purchases,
        purchaseValue: metrics.purchaseValue,
        ctr: metrics.ctr,
        cpc: metrics.cpc,
        cpm: metrics.cpm,
        roas: metrics.roas,
        costPerPurchase: metrics.costPerPurchase,
        outboundCvr: metrics.outboundCvr,
        hookRate: metrics.hookRate,
        holdRate: metrics.holdRate,
        video3sViews: metrics.video3sViews,
        thruplays: metrics.thruplays
      },
      videoTranscript: hasTranscript
        ? {
            language: transcript.language,
            durationSeconds: transcript.durationSeconds,
            hookTranscript: getHookTranscript(transcript),
            sections: {
              hook: getTranscriptSection(transcript, "hook"),
              body: getTranscriptSection(transcript, "body"),
              ending: getTranscriptSection(transcript, "ending")
            },
            fullTranscript: truncateText(transcript.transcript ?? ""),
            firstSegments: transcript.segments.slice(0, 12)
          }
        : null
    },
    null,
    2
  );
}

function imageUrlForAnalysis(creative: CreativeRow) {
  const url = creative.image_url ?? creative.thumbnail_url;
  return url?.startsWith("http") ? url : null;
}

async function callOpenRouterForAnalysis(input: { creative: CreativeRow; clientName: string; profile: string; knowledge: string; creativeData: string }) {
  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY fehlt. Bitte in .env.local setzen.");

  const model = getOptionalEnv("OPENROUTER_VISION_MODEL", getOptionalEnv("OPENROUTER_TEXT_MODEL", "openai/gpt-5.2"));
  const imageUrl = imageUrlForAnalysis(input.creative);
  const userText = `Kunde: ${input.clientName}\n\nKundenprofil:\n${input.profile}\n\nCreative Daten:\n${input.creativeData}\n\nRelevante Wissensdatenbank:\n${input.knowledge}\n\nAnalysiere dieses Creative fuer Paid Social. Wenn ein Bild/Thumbnail beigefuegt ist, beziehe visuelle Elemente ein. Antworte exakt mit JSON Keys:\nsummary, creativeType, funnelStage, funnelReason, visualElements, detectedText, hook, targetAudienceFitScore, brandFitScore, clarityScore, scrollstopperScore, ctaScore, risks, hypotheses, recommendations.\n\nWichtig zur Funnel-Klassifikation:\n- funnelStage beschreibt die wahrscheinliche AUSPIEL-/DELIVERY-Stufe, nicht nur die Messaging-Absicht des Creatives.\n- Wenn Messaging und Delivery-Signale widersprechen, klassifiziere nach Delivery-Signalen und erwaehne den Mismatch in funnelReason.\n- Eine BOFU-Message (z. B. "Jetzt bestellen", Rabatt, Versandvorteil) ist nicht automatisch BOFU, wenn Frequency/Reach nach breiter Ausspielung aussehen.\n\nFunnel-Heuristik:\n- TOFU = breite Prospecting-/Awareness-Ausspielung. Typisch: niedrige Frequency (< 1,5), hohe Reach im Vergleich zu Impressions, wenig Wiederkontakt. Auch bei kaufnaher Copy als TOFU klassifizieren, wenn Frequency sehr niedrig ist und keine klaren Retargeting-Signale vorhanden sind.\n- MOFU = Consideration/Nurturing. Typisch: mittlere Frequency (ca. 1,5-3), Social Proof, Produkt-/Sortimentsargumente, Vertrauen, Vorteile, Vergleich, Einwandbehandlung.\n- BOFU = Retargeting/Conversion-nah. Typisch: hoehere Frequency (> 3) oder klare Retargeting-/Warm-Audience-Signale plus Kaufabschluss-Message und passende Conversion-KPIs. Hohe Frequency ohne Conversion ist Fatigue-/Mismatch-Risiko, nicht automatisch BOFU.\n- funnelStage darf nur TOFU, MOFU oder BOFU sein. funnelReason erklaert die Einordnung in 1-2 Saetzen und muss Frequency/Reach einbeziehen, wenn diese Daten vorhanden sind.\n\nRegeln:\n- Scores 0 bis 100.\n- risks, hypotheses, recommendations sind Arrays mit kurzen deutschen Strings.\n- Keine unbelegten Health-Claims erfinden.\n- Beruecksichtige Brand Fit, Zielgruppenfit, Funnel Stage, Frequency, Reach und Performance-Metriken.\n- Antworte ausschliesslich als JSON Objekt.`;
  const analysisText = `${userText}\n\nEmotionen:\n- Antworte zusaetzlich mit emotionScores als Objekt mit exakt diesen Keys: curiosity, desire, trust, urgency, joy, fearOfMissingOut.\n- Jeder emotionScores-Wert ist ein Score von 0 bis 100.\n- curiosity = Neugier/Pattern-Interrupt, desire = Appetit/Kaufverlangen, trust = Glaubwuerdigkeit/Sicherheit, urgency = Handlungsdruck, joy = positive Genuss-/Freude-Emotion, fearOfMissingOut = Verlustangst/FOMO.\n- Bewerte Emotionen anhand Copy, Transcript, Visual und Performance-Kontext. Wenn ein Signal fehlt, vergib konservativ niedrigere Werte.`;
  const content = imageUrl
    ? [
        { type: "text", text: analysisText },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    : analysisText;

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
          content: "Du bist ein Senior Creative Strategist und Performance-Marketing-Analyst. Bewerte Creatives faktenbasiert anhand Kunde, Wissen, Copy, Visual und Performance."
        },
        {
          role: "system",
          content: "Gib zusaetzlich den JSON-Key hookExplanation aus. Das JSON-Feld hook muss kurz und wortgetreu sein: Bei Image Ads nur Text-Overlay im Bild; bei Video Ads nur transkribierter Text aus hookTranscript/ersten Segmenten. Keine Visual-Beschreibung, keine Analyse, keine Risiken, keine Begruendung im hook-Feld. Nutze hookExplanation fuer die Bewertung und risks fuer Probleme. Wenn kein Text-Overlay bzw. kein Transcript vorhanden ist, hook leer lassen und dies in hookExplanation erklaeren."
        },
        {
          role: "system",
          content: "Wenn videoTranscript.sections vorhanden ist, gib zusaetzlich videoStructure aus: { hook: { text, analysis, score }, body: { text, analysis, score }, ending: { text, analysis, score } }. text muss wortgetreu aus den Transcript-Sections stammen, analysis bewertet Wirkung/Klarheit/Conversion-Funktion kurz auf Deutsch, score ist 0-100. Wenn kein Transcript vorhanden ist, videoStructure null."
        },
        { role: "user", content }
      ]
    })
  });
  const payload = (await response.json()) as OpenRouterChatResponse;

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "OpenRouter Creative Analyse fehlgeschlagen.");
  }

  const responseText = textFromContent(payload.choices?.[0]?.message?.content);
  if (!responseText.trim()) throw new Error("OpenRouter Antwort war leer.");

  return { model, generated: normalizeGeneratedAnalysis(extractJsonObject(responseText)) };
}

export async function getLatestCreativeAnalysis(clientId: string, creativeId: string): Promise<{ analysis: CreativeAiAnalysis | null; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("creative_ai_analyses")
      .select("id,model,status,summary,creative_type,funnel_stage,funnel_reason,visual_elements,detected_text,hook,target_audience_fit_score,brand_fit_score,clarity_score,scrollstopper_score,cta_score,risks,hypotheses,raw,created_at")
      .eq("client_id", clientId)
      .eq("creative_id", creativeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { analysis: null, error: error.message };
    return { analysis: data ? mapAnalysis(data as CreativeAiAnalysisRow) : null, error: null };
  } catch (error) {
    return { analysis: null, error: error instanceof Error ? error.message : "AI Analyse konnte nicht geladen werden." };
  }
}

export async function analyzeCreative(clientId: string, creativeId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: client, error: clientError }, { data: creative, error: creativeError }, { data: profile }, { data: insights }, { data: chunks }, { transcript }] = await Promise.all([
    supabase.from("clients").select("id,name").eq("id", clientId).maybeSingle(),
    supabase
      .from("creatives")
      .select("id,client_id,meta_creative_id,creative_type,name,title,body,call_to_action_type,image_url,thumbnail_url,video_id,landing_url")
      .eq("client_id", clientId)
      .eq("id", creativeId)
      .maybeSingle(),
    supabase.from("client_profiles").select("brand_name,positioning,tone_of_voice,target_audience,pain_points,buying_triggers,usps,offers,forbidden_claims,brand_no_gos,competitors,cta_preferences").eq("client_id", clientId).maybeSingle(),
    supabase.from("creative_insights_daily").select("spend,impressions,reach,clicks,link_clicks,outbound_clicks,purchases,purchase_value,engagement,video_3s_views,thruplays").eq("creative_id", creativeId),
    supabase.from("client_knowledge_chunks").select("content,chunk_index,metadata").eq("client_id", clientId).order("created_at", { ascending: false }).order("chunk_index", { ascending: true }).limit(60),
    getLatestCreativeVideoTranscript(clientId, creativeId)
  ]);

  if (clientError) throw new Error(clientError.message);
  if (creativeError) throw new Error(creativeError.message);
  if (!client) throw new Error("Kunde wurde nicht gefunden.");
  if (!creative) throw new Error("Creative wurde nicht gefunden.");

  const creativeRow = creative as CreativeRow;
  const { model, generated } = await callOpenRouterForAnalysis({
    creative: creativeRow,
    clientName: client.name,
    profile: profileContext((profile ?? null) as ProfileRow | null),
    knowledge: knowledgeContext((chunks ?? []) as KnowledgeChunkRow[]),
    creativeData: creativeContext(creativeRow, (insights ?? []) as InsightRow[], transcript)
  });

  const { data: inserted, error: insertError } = await supabase
    .from("creative_ai_analyses")
    .insert({
      client_id: clientId,
      creative_id: creativeId,
      model,
      status: "completed",
      summary: generated.summary || null,
      creative_type: generated.creativeType || creativeRow.creative_type,
      funnel_stage: generated.funnelStage,
      funnel_reason: generated.funnelReason || null,
      visual_elements: generated.visualElements,
      detected_text: generated.detectedText || null,
      hook: generated.hook || null,
      target_audience_fit_score: generated.targetAudienceFitScore,
      brand_fit_score: generated.brandFitScore,
      clarity_score: generated.clarityScore,
      scrollstopper_score: generated.scrollstopperScore,
      cta_score: generated.ctaScore,
      risks: generated.risks,
      hypotheses: generated.hypotheses,
      raw: { ...generated, recommendations: generated.recommendations, hookExplanation: generated.hookExplanation, videoStructure: generated.videoStructure }
    })
    .select("id,model,status,summary,creative_type,funnel_stage,funnel_reason,visual_elements,detected_text,hook,target_audience_fit_score,brand_fit_score,clarity_score,scrollstopper_score,cta_score,risks,hypotheses,raw,created_at")
    .single();

  if (insertError || !inserted) throw new Error(insertError?.message ?? "AI Analyse konnte nicht gespeichert werden.");

  return mapAnalysis(inserted as CreativeAiAnalysisRow);
}
