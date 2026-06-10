import "server-only";

import { createHash } from "node:crypto";
import { CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getOptionalEnv } from "@/lib/env";
import { normalizeLandingUrl } from "@/lib/landingpage-utils";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

type OpenRouterMessageContent = string | Array<{ type?: string; text?: string }> | undefined;

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: OpenRouterMessageContent;
    };
  }>;
  error?: { message?: string };
};

type ExtractedLandingpage = {
  normalizedUrl: string;
  finalUrl: string;
  httpStatus: number;
  title: string | null;
  metaDescription: string | null;
  text: string;
  contentHash: string;
};

type LandingpageAnalysisPayload = {
  primaryOffer: string;
  targetAudience: string;
  funnelStage: string | null;
  valueProps: string[];
  proofPoints: string[];
  objections: string[];
  ctas: string[];
  keywords: string[];
  productCategories: string[];
  matchSignals: string[];
  summary: string;
  risks: string[];
};

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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 20);
}

function normalizeFunnelStage(value: unknown) {
  const stage = stringValue(value).toUpperCase();
  if (stage === "TOFU" || stage === "MOFU" || stage === "BOFU") return stage;
  return null;
}

function normalizeAnalysisPayload(payload: JsonRecord): LandingpageAnalysisPayload {
  return {
    primaryOffer: stringValue(payload.primaryOffer),
    targetAudience: stringValue(payload.targetAudience),
    funnelStage: normalizeFunnelStage(payload.funnelStage),
    valueProps: stringArray(payload.valueProps),
    proofPoints: stringArray(payload.proofPoints),
    objections: stringArray(payload.objections),
    ctas: stringArray(payload.ctas),
    keywords: stringArray(payload.keywords),
    productCategories: stringArray(payload.productCategories),
    matchSignals: stringArray(payload.matchSignals),
    summary: stringValue(payload.summary),
    risks: stringArray(payload.risks)
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function firstMatch(html: string, pattern: RegExp) {
  return decodeHtml(html.match(pattern)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "") || null;
}

function matches(html: string, pattern: RegExp, limit = 40) {
  return Array.from(html.matchAll(pattern))
    .map((match) => decodeHtml(match[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? ""))
    .filter(Boolean)
    .slice(0, limit);
}

function extractLandingpageText(html: string, normalizedUrl: string, finalUrl: string, httpStatus: number): ExtractedLandingpage {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ?? firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const headings = matches(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 30);
  const buttons = matches(html, /<(?:button|a)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi, 40);
  const paragraphs = matches(html, /<p[^>]*>([\s\S]*?)<\/p>/gi, 80);
  const body = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  const text = [
    title ? `Title: ${title}` : "",
    metaDescription ? `Meta Description: ${metaDescription}` : "",
    headings.length > 0 ? `Headings:\n${headings.join("\n")}` : "",
    buttons.length > 0 ? `CTAs / Links:\n${buttons.join("\n")}` : "",
    paragraphs.length > 0 ? `Paragraphs:\n${paragraphs.join("\n")}` : "",
    `Body Text:\n${body}`
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 30000);

  return {
    normalizedUrl,
    finalUrl,
    httpStatus,
    title,
    metaDescription,
    text,
    contentHash: createHash("sha256").update(text).digest("hex")
  };
}

async function fetchLandingpage(url: string) {
  const normalizedUrl = normalizeLandingUrl(url);
  if (!normalizedUrl) throw new Error("Ungueltige Landingpage URL.");
  const parsedUrl = new URL(normalizedUrl);
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error("Nur HTTP/HTTPS Landingpages koennen gecrawlt werden.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(normalizedUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "HerbAdsBot/1.0 (+https://herb.media)",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error(`Landingpage ist kein HTML Dokument (${contentType || "unknown"}).`);
    }

    const html = await response.text();
    if (!response.ok) throw new Error(`Landingpage konnte nicht geladen werden (${response.status}).`);
    return extractLandingpageText(html, normalizedUrl, response.url, response.status);
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouterForLandingpage(input: ExtractedLandingpage) {
  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY fehlt. Bitte in .env.local setzen.");

  const model = getOptionalEnv("OPENROUTER_TEXT_MODEL", "openai/gpt-5.2");
  const prompt = `Analysiere diese Landingpage fuer Paid Social Creative/Landingpage-Match. Antworte exakt mit JSON Keys:
primaryOffer, targetAudience, funnelStage, valueProps, proofPoints, objections, ctas, keywords, productCategories, matchSignals, summary, risks.

Regeln:
- Sprache: Deutsch.
- funnelStage darf nur TOFU, MOFU oder BOFU sein.
- valueProps, proofPoints, objections, ctas, keywords, productCategories, matchSignals, risks sind Arrays mit kurzen Strings.
- matchSignals sind konkrete Begriffe/Versprechen/Angebote, die Ads enthalten sollten, damit sie gut zur Landingpage passen.
- Keine erfundenen Aussagen. Wenn etwas nicht erkennbar ist, nutze leere Strings/Arrays.

URL: ${input.finalUrl}

Extrahierter Landingpage-Text:
${input.text}`;

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
          content: "Du bist ein Senior CRO- und Performance-Marketing-Analyst. Du extrahierst Landingpage-Signale fuer Creative-Match, Funnel-Fit und Angebotskonsistenz."
        },
        { role: "user", content: prompt }
      ]
    })
  });
  const payload = (await response.json()) as OpenRouterChatResponse;

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "OpenRouter Landingpage Analyse fehlgeschlagen.");
  }

  const responseText = textFromContent(payload.choices?.[0]?.message?.content);
  if (!responseText.trim()) throw new Error("OpenRouter Antwort war leer.");

  return { model, generated: normalizeAnalysisPayload(extractJsonObject(responseText)) };
}

export async function analyzeLandingpage(clientId: string, url: string) {
  const supabase = createSupabaseServiceRoleClient();
  const normalizedUrl = normalizeLandingUrl(url);
  if (!normalizedUrl) throw new Error("Ungueltige Landingpage URL.");

  await supabase.from("landingpage_analyses").upsert(
    {
      client_id: clientId,
      normalized_url: normalizedUrl,
      status: "processing",
      error_message: null
    },
    { onConflict: "client_id,normalized_url" }
  );

  try {
    const extracted = await fetchLandingpage(normalizedUrl);
    const { model, generated } = await callOpenRouterForLandingpage(extracted);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("landingpage_analyses")
      .upsert(
        {
          client_id: clientId,
          normalized_url: extracted.normalizedUrl,
          final_url: extracted.finalUrl,
          status: "completed",
          http_status: extracted.httpStatus,
          title: extracted.title,
          meta_description: extracted.metaDescription,
          extracted_text: extracted.text,
          content_hash: extracted.contentHash,
          primary_offer: generated.primaryOffer || null,
          target_audience: generated.targetAudience || null,
          funnel_stage: generated.funnelStage,
          ctas: generated.ctas,
          value_props: generated.valueProps,
          proof_points: generated.proofPoints,
          objections: generated.objections,
          keywords: generated.keywords,
          product_categories: generated.productCategories,
          match_signals: generated.matchSignals,
          summary: generated.summary || null,
          risks: generated.risks,
          analysis: { ...generated, model },
          error_message: null,
          crawled_at: now,
          analyzed_at: now
        },
        { onConflict: "client_id,normalized_url" }
      )
      .select("id,normalized_url,status,final_url,title,primary_offer,analyzed_at")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Landingpage Analyse konnte nicht gespeichert werden.");
    revalidateCacheTags(CACHE_TAGS.landingpages);
    return data;
  } catch (error) {
    await supabase.from("landingpage_analyses").upsert(
      {
        client_id: clientId,
        normalized_url: normalizedUrl,
        status: "failed",
        error_message: error instanceof Error ? error.message : "Landingpage Analyse fehlgeschlagen."
      },
      { onConflict: "client_id,normalized_url" }
    );

    revalidateCacheTags(CACHE_TAGS.landingpages);
    throw error;
  }
}
