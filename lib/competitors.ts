import "server-only";

import { unstable_cache } from "next/cache";
import type { BrowserContext, Page } from "playwright";
import { CACHE_TAGS, COMPETITOR_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getCompetitorDeliveryLocations } from "@/lib/competitor-demographics";
import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getHookTranscript, mapRawCompetitorVideoTranscript, transcribeCompetitorCreativeVideo, type CreativeVideoTranscript } from "@/lib/video-transcripts";

type JsonRecord = Record<string, unknown>;

type CompetitorRow = {
  id: string;
  client_id: string;
  name: string;
  website_url: string | null;
  meta_page_id: string | null;
  meta_ad_library_url: string | null;
  notes: string | null;
  crawl_enabled?: boolean | null;
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
  demographic_signals?: JsonRecord | null;
  age_ranges?: unknown;
  gender_signals?: unknown;
  audience_locations?: unknown;
  audience_interests?: unknown;
  raw?: JsonRecord | null;
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
  target_audience?: string | null;
  age_signal?: string | null;
  audience_reasoning?: string | null;
  thesis?: string | null;
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

type PublicAdLibraryItem = {
  id: string | null;
  sourceUrl: string;
  status: string;
  format: string;
  platforms: string[];
  startedAt: string | null;
  endedAt: string | null;
  reachMin: number | null;
  reachMax: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  landingUrl: string | null;
  primaryText: string | null;
  headline: string | null;
  hook: string | null;
  cta: string | null;
  demographicSignals: JsonRecord;
  ageRanges: string[];
  genderSignals: string[];
  audienceLocations: string[];
  audienceInterests: string[];
  raw: JsonRecord;
};

type BrowserAdLibraryCard = {
  id: string;
  text: string;
  images: string[];
  videos: string[];
  links: string[];
};

type EuTransparencySignals = {
  source: "meta_eu_transparency";
  scrapedAt: string;
  targetLocations: Array<{ location: string; locationType: string; includedOrExcluded: string }>;
  targetAgeRange: string | null;
  targetGender: string | null;
  euReach: number | null;
  reachBreakdown: Array<{ location: string; ageRange: string; gender: string; reach: number }>;
  rawSectionPreview: string;
};

type BrowserCrawlResult = {
  items: PublicAdLibraryItem[];
  raw: JsonRecord;
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
  targetAudience: string;
  ageSignal: string;
  audienceReasoning: string;
  thesis: string;
  rankingScore: number | null;
};

export type Competitor = {
  id: string;
  name: string;
  websiteUrl: string | null;
  metaPageId: string | null;
  metaAdLibraryUrl: string | null;
  notes: string | null;
  crawlEnabled: boolean;
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
  targetAudience: string | null;
  ageSignal: string | null;
  audienceReasoning: string | null;
  thesis: string | null;
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
  demographicSignals: JsonRecord;
  ageRanges: string[];
  genderSignals: string[];
  audienceLocations: string[];
  audienceInterests: string[];
  videoTranscript: CreativeVideoTranscript | null;
  rankingScore: number;
  analysis: CompetitorCreativeAnalysis | null;
  lastSeenAt: string;
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
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

function normalizePublicAdLibraryUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Nur HTTP/HTTPS Ad Library Links koennen gecrawlt werden.");
  if (!/(^|\.)facebook\.com$/i.test(url.hostname)) throw new Error("Bitte nutze einen facebook.com Ad Library Link.");
  return url.toString();
}

function publicAdUrl(adId: string) {
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`) as string;
  } catch {
    return value;
  }
}

function normalizeSerializedString(value: string) {
  return decodeHtmlEntities(
    decodeJsonString(value)
      .replace(/\\u0025/g, "%")
      .replace(/\\\//g, "/")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\"/g, "\"")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function visibleTextFromHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractStringValuesForKeys(html: string, keys: string[], limit = 20, options: { allowUrls?: boolean } = {}) {
  const values: string[] = [];
  const escapedKeys = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pairPattern = new RegExp(`"(?:${escapedKeys})"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "gi");
  const arrayPattern = new RegExp(`"(?:${escapedKeys})"\\s*:\\s*\\[((?:\\s*"(?:(?:\\\\.|[^"\\\\])*)"\\s*,?)+)\\]`, "gi");

  for (const match of html.matchAll(pairPattern)) {
    values.push(normalizeSerializedString(match[1]));
  }

  for (const match of html.matchAll(arrayPattern)) {
    const arrayContent = match[1] ?? "";
    for (const item of arrayContent.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
      values.push(normalizeSerializedString(item[1]));
    }
  }

  return uniqueStrings(values)
    .filter((value) => value.length >= 2 && value.length <= 1200 && (options.allowUrls || !/^https?:\/\//i.test(value)))
    .slice(0, limit);
}

function extractUrlValues(html: string, keys: string[], limit = 12) {
  return extractStringValuesForKeys(html, keys, limit, { allowUrls: true })
    .map((value) => {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return url.toString();
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));
}

function extractAdIdsFromHtml(html: string) {
  const ids = [
    ...Array.from(html.matchAll(/["\\]ad_archive_id["\\]?\s*[:=]\s*["\\]?(\d{8,})/gi)).map((match) => match[1]),
    ...Array.from(html.matchAll(/["\\]adLibraryID["\\]?\s*[:=]\s*["\\]?(\d{8,})/gi)).map((match) => match[1]),
    ...Array.from(html.matchAll(/[?&](?:id|ad_archive_id|ad_id)=(\d{8,})/gi)).map((match) => match[1])
  ];
  return uniqueStrings(ids);
}

function extractDateFromHtml(html: string, keys: string[]) {
  const direct = extractStringValuesForKeys(html, keys, 1)[0];
  if (direct) return parseDate(direct);
  return null;
}

function extractReachFromText(text: string) {
  const normalized = text.replace(/\./g, "").replace(/,/g, "");
  const rangeMatch = normalized.match(/\b(?:reach|impressions|reichweite|impressionen)[^\d]{0,30}(\d{2,})\s*[-–]\s*(\d{2,})/i);
  if (rangeMatch) return { min: nullableNumber(rangeMatch[1]), max: nullableNumber(rangeMatch[2]) };
  const singleMatch = normalized.match(/\b(?:reach|impressions|reichweite|impressionen)[^\d]{0,30}(\d{2,})/i);
  if (singleMatch) return { min: nullableNumber(singleMatch[1]), max: null };
  return { min: null, max: null };
}

function extractAgeRanges(text: string) {
  return uniqueStrings(Array.from(text.matchAll(/\b(?:13-17|18-24|25-34|35-44|45-54|55-64|65\+)\b/g)).map((match) => match[0]));
}

function extractGenderSignals(text: string) {
  const signals: string[] = [];
  if (/\b(?:women|female|frauen|weiblich)\b/i.test(text)) signals.push("female");
  if (/\b(?:men|male|maenner|männer|maennlich|männlich)\b/i.test(text)) signals.push("male");
  if (/\b(?:all genders|alle geschlechter)\b/i.test(text)) signals.push("all");
  return uniqueStrings(signals);
}

function extractAudienceLocations(text: string) {
  const locations = ["Germany", "Deutschland", "Austria", "Oesterreich", "Österreich", "Switzerland", "Schweiz", "Italy", "Italien", "DE", "AT", "CH", "IT"];
  return locations.filter((location) => new RegExp(`\\b${location}\\b`, "i").test(text));
}

function compactTextLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\u200b/g, "").trim())
    .filter(Boolean);
}

function numberFromDisplay(value: string | null | undefined) {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAdLibraryDisplayDate(value: string | null | undefined) {
  const match = value?.match(/Started running on ([A-Za-z]+) (\d{1,2}), (\d{4})/);
  if (!match) return null;
  const months: Record<string, number> = {
    Jan: 1,
    January: 1,
    Feb: 2,
    February: 2,
    Mar: 3,
    March: 3,
    Apr: 4,
    April: 4,
    May: 5,
    Jun: 6,
    June: 6,
    Jul: 7,
    July: 7,
    Aug: 8,
    August: 8,
    Sep: 9,
    Sept: 9,
    September: 9,
    Oct: 10,
    October: 10,
    Nov: 11,
    November: 11,
    Dec: 12,
    December: 12
  };
  const month = months[match[1]];
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function isAdDomainLine(line: string | undefined) {
  return Boolean(line && /^[A-Z0-9][A-Z0-9.-]*\.[A-Z]{2,}(?:\/\S*)?$/i.test(line) && line === line.toUpperCase());
}

function urlFromAdDomainLine(line: string | undefined) {
  return isAdDomainLine(line) ? `https://${line?.toLowerCase()}` : null;
}

function landingUrlFromCard(card: BrowserAdLibraryCard, domainLine: string | undefined) {
  for (const link of card.links) {
    try {
      const url = new URL(link);
      if (url.hostname === "l.facebook.com") {
        const target = url.searchParams.get("u");
        if (target) return target;
      }
      if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return url.toString();
    } catch {
      continue;
    }
  }
  return urlFromAdDomainLine(domainLine);
}

function firstSentence(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.split(/(?<=[.!?])\s+/)[0]?.slice(0, 160) || null;
}

function parseBrowserAdCard(card: BrowserAdLibraryCard): PublicAdLibraryItem {
  const lines = compactTextLines(card.text);
  const startedAt = parseAdLibraryDisplayDate(lines.find((line) => line.startsWith("Started running on ")));
  const active = lines.includes("Active");
  const sponsoredIndex = lines.lastIndexOf("Sponsored");
  const content = sponsoredIndex >= 0 ? lines.slice(sponsoredIndex + 1) : lines;
  const videoIndex = content.findIndex((line) => /^\d+:\d+\s*\/\s*\d+:\d+$/.test(line));
  const domainIndex = content.findIndex((line) => isAdDomainLine(line));
  const endCandidates = [videoIndex, domainIndex].filter((index) => index >= 0);
  const primaryEnd = endCandidates.length ? Math.min(...endCandidates) : Math.max(1, content.length - 2);
  const primaryText = content.slice(0, primaryEnd).join("\n").trim() || null;
  const afterMetaIndex = domainIndex >= 0 ? domainIndex + 1 : videoIndex >= 0 ? videoIndex + 1 : primaryEnd;
  const cta = content.slice(afterMetaIndex).reverse().find((line) => /^(order|shop|learn|buy|contact|mehr|jetzt|zum|anfragen)/i.test(line)) ?? null;
  const headline = content.slice(afterMetaIndex).find((line) => line !== cta && !isAdDomainLine(line)) ?? null;
  const imageUrl = card.images.find((url) => /^https?:\/\//i.test(url)) ?? null;
  const videoUrl = card.videos.find((url) => /^https?:\/\//i.test(url)) ?? null;

  return {
    id: card.id,
    sourceUrl: publicAdUrl(card.id),
    status: active ? "active" : "inactive",
    format: videoUrl || videoIndex >= 0 ? "video" : imageUrl ? "static" : "unknown",
    platforms: [],
    startedAt,
    endedAt: active ? null : null,
    reachMin: null,
    reachMax: null,
    imageUrl,
    videoUrl,
    thumbnailUrl: imageUrl,
    landingUrl: landingUrlFromCard(card, content[domainIndex]),
    primaryText,
    headline,
    hook: firstSentence(primaryText || headline),
    cta,
    demographicSignals: {
      source: "public_ad_library_browser",
      note: "Creative-Daten aus der gerenderten Meta Ad Library extrahiert. EU-Transparency wird im Detailpanel separat angereichert."
    },
    ageRanges: [],
    genderSignals: [],
    audienceLocations: [],
    audienceInterests: [],
    raw: {
      source: "public_ad_library_browser",
      text: card.text,
      images: card.images,
      videos: card.videos,
      links: card.links
    }
  };
}

function parseEuTransparencySignals(bodyText: string): EuTransparencySignals | null {
  const textLines = compactTextLines(bodyText);
  const start = textLines.lastIndexOf("EU ad audience");
  if (start < 0) return null;
  const endCandidates = [
    textLines.indexOf("About the advertiser", start),
    textLines.indexOf("Advertiser and payer", start),
    textLines.indexOf("About ads and data use", start)
  ].filter((index) => index > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : textLines.length;
  const sectionLines = textLines.slice(start, end);
  const ageIndex = sectionLines.indexOf("Age");
  const genderIndex = sectionLines.indexOf("Gender");
  const deliveryIndex = sectionLines.indexOf("EU ad delivery");
  const includedHeaderIndex = sectionLines.indexOf("Included or excluded");
  const targetLocations: EuTransparencySignals["targetLocations"] = [];

  if (includedHeaderIndex >= 0 && ageIndex > includedHeaderIndex) {
    for (let index = includedHeaderIndex + 1; index + 2 < ageIndex; index += 3) {
      const location = sectionLines[index];
      const locationType = sectionLines[index + 1];
      const includedOrExcluded = sectionLines[index + 2];
      if (!location || !locationType || !includedOrExcluded) continue;
      targetLocations.push({ location, locationType, includedOrExcluded });
    }
  }

  const targetAge = ageIndex >= 0 ? sectionLines[ageIndex + 1] ?? null : null;
  const targetAgeRange = targetAge?.match(/(\d{1,2}-\d{1,2}\+?|\d{1,2}\+)/)?.[1] ?? targetAge;
  const targetGender = genderIndex >= 0 ? sectionLines[genderIndex + 1] ?? null : null;
  const reachLabelIndex = deliveryIndex >= 0 ? sectionLines.indexOf("Reach", deliveryIndex) : -1;
  const euReach = reachLabelIndex >= 0 ? numberFromDisplay(sectionLines[reachLabelIndex + 1]) : null;
  const breakdownHeaderIndex = sectionLines.findIndex((line, index) =>
    index > deliveryIndex &&
    line === "Location" &&
    sectionLines[index + 1] === "Age Range" &&
    sectionLines[index + 2] === "Gender" &&
    sectionLines[index + 3] === "Reach"
  );
  const reachBreakdown: EuTransparencySignals["reachBreakdown"] = [];

  if (breakdownHeaderIndex >= 0) {
    for (let index = breakdownHeaderIndex + 4; index + 3 < sectionLines.length; index += 4) {
      const location = sectionLines[index];
      const ageRange = sectionLines[index + 1];
      const gender = sectionLines[index + 2];
      const reach = numberFromDisplay(sectionLines[index + 3]);
      if (!location || !ageRange || !gender || reach === null) break;
      reachBreakdown.push({ location, ageRange, gender, reach });
    }
  }

  if (!targetLocations.length && !targetAgeRange && !targetGender && euReach === null && !reachBreakdown.length) return null;

  return {
    source: "meta_eu_transparency",
    scrapedAt: new Date().toISOString(),
    targetLocations,
    targetAgeRange,
    targetGender,
    euReach,
    reachBreakdown,
    rawSectionPreview: sectionLines.join("\n").slice(0, 12000)
  };
}

function extractPlatforms(html: string, text: string) {
  const serialized = extractStringValuesForKeys(html, ["publisher_platforms", "platforms"], 12);
  const platformText = `${serialized.join(" ")} ${text}`;
  const platforms = [
    /instagram/i.test(platformText) ? "instagram" : null,
    /facebook/i.test(platformText) ? "facebook" : null,
    /messenger/i.test(platformText) ? "messenger" : null,
    /audience_network/i.test(platformText) ? "audience_network" : null
  ];
  return uniqueStrings(platforms);
}

function inferFormatFromPublicAd(input: { html: string; imageUrl: string | null; videoUrl: string | null }) {
  if (input.videoUrl || /video|reel|playable_video/i.test(input.html)) return "video";
  if (/carousel|multi_share/i.test(input.html)) return "carousel";
  if (input.imageUrl) return "static";
  return "unknown";
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
    crawlEnabled: row.crawl_enabled !== false,
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
    targetAudience: row.target_audience ?? null,
    ageSignal: row.age_signal ?? null,
    audienceReasoning: row.audience_reasoning ?? null,
    thesis: row.thesis ?? null,
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
    demographicSignals: row.demographic_signals ?? {},
    ageRanges: stringArray(row.age_ranges),
    genderSignals: stringArray(row.gender_signals),
    audienceLocations: stringArray(row.audience_locations),
    audienceInterests: stringArray(row.audience_interests),
    videoTranscript: mapRawCompetitorVideoTranscript(row.raw),
    rankingScore: scoreCreative(row, analysis),
    analysis: mapAnalysis(analysis),
    lastSeenAt: nullableString(row.raw?.lastSeenAt) ?? row.created_at,
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
    .select("id,competitor_creative_id,model,status,hook,hook_explanation,body,ending,visual_elements,detected_text,offer,angle,funnel_stage,emotion_scores,strengths,weaknesses,hypotheses,adaptation_ideas,target_audience,age_signal,audience_reasoning,thesis,ranking_score,raw,created_at")
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

async function getCompetitorOverviewUncached(clientId: string): Promise<CompetitorOverview> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [{ data: competitors, error: competitorsError }, { data: sources, error: sourcesError }, { data: creatives, error: creativesError }, cpmBase, links, analyses] = await Promise.all([
      supabase.from("competitors").select("id,client_id,name,website_url,meta_page_id,meta_ad_library_url,notes,crawl_enabled,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("competitor_ad_library_sources").select("id,client_id,competitor_id,url,status,error_message,last_checked_at,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("competitor_creatives").select("id,client_id,competitor_id,source_id,source_url,ad_library_id,status,format,platforms,started_at,ended_at,active_days,reach_min,reach_max,reach_estimate,estimated_cpm,estimated_spend,estimated_daily_spend,estimate_confidence,thumbnail_url,video_url,image_url,landing_url,primary_text,headline,hook,cta,demographic_signals,age_ranges,gender_signals,audience_locations,audience_interests,raw,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
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

const getCompetitorOverviewCached = unstable_cache(
  getCompetitorOverviewUncached,
  ["competitor-overview-v1"],
  { revalidate: 120, tags: [CACHE_TAGS.competitors] }
);

export async function getCompetitorOverview(clientId: string): Promise<CompetitorOverview> {
  return getCompetitorOverviewCached(clientId);
}

function revalidateCompetitorCaches() {
  try {
    revalidateCacheTags(...COMPETITOR_CACHE_TAGS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("static generation store missing")) throw error;
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

  revalidateCompetitorCaches();
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
  revalidateCompetitorCaches();
  return getCompetitorOverview(clientId);
}

export async function updateCompetitorCrawlSettings(clientId: string, competitorId: string, input: { crawlEnabled: boolean }) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("competitors")
    .update({ crawl_enabled: input.crawlEnabled })
    .eq("client_id", clientId)
    .eq("id", competitorId);
  if (error) throw new Error(error.message);
  revalidateCompetitorCaches();
  return getCompetitorOverview(clientId);
}

async function fetchPublicAdLibraryHtml(url: string) {
  const normalizedUrl = normalizePublicAdLibraryUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(normalizedUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    if (!response.ok) throw new Error(`Ad Library Link konnte nicht geladen werden (${response.status}).`);
    return { html: await response.text(), finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

function publicAdItemFromHtml(html: string, sourceUrl: string, adId: string | null): PublicAdLibraryItem {
  const text = visibleTextFromHtml(html);
  const bodyCandidates = extractStringValuesForKeys(html, ["ad_creative_bodies", "ad_creative_body", "message", "body", "primary_text"], 10);
  const headlineCandidates = extractStringValuesForKeys(html, ["ad_creative_link_titles", "ad_creative_link_title", "title", "headline", "caption"], 10);
  const ctaCandidates = extractStringValuesForKeys(html, ["call_to_action_type", "cta_text", "cta"], 4);
  const imageUrls = extractUrlValues(html, ["image_url", "thumbnail_url", "resized_image_url", "original_image_url"], 8);
  const videoUrls = extractUrlValues(html, ["video_url", "video_hd_url", "video_sd_url", "playable_url"], 4);
  const landingUrls = extractUrlValues(html, ["link_url", "website_url", "landing_url", "url"], 8)
    .filter((url) => !url.includes("facebook.com/ads/library") && !url.includes("facebook.com/ads/archive"));
  const startedAt = extractDateFromHtml(html, ["ad_delivery_start_time", "start_date", "started_at"]);
  const endedAt = extractDateFromHtml(html, ["ad_delivery_stop_time", "end_date", "ended_at"]);
  const reach = extractReachFromText(text);
  const ageRanges = extractAgeRanges(text);
  const genderSignals = extractGenderSignals(text);
  const audienceLocations = extractAudienceLocations(text);
  const platforms = extractPlatforms(html, text);
  const primaryText = bodyCandidates[0] ?? null;
  const headline = headlineCandidates[0] ?? null;
  const imageUrl = imageUrls[0] ?? null;
  const videoUrl = videoUrls[0] ?? null;
  const demographicSignals = {
    source: ageRanges.length || genderSignals.length || audienceLocations.length ? "public_ad_library_html" : "not_publicly_visible",
    ageRanges,
    genderSignals,
    audienceLocations,
    note: ageRanges.length || genderSignals.length || audienceLocations.length
      ? "Aus oeffentlich sichtbarem/serialisiertem Ad-Library-HTML extrahiert."
      : "Keine echten Delivery-Demografien im oeffentlichen HTML gefunden; Zielgruppe kann nur per AI aus Creative/Copy inferiert werden."
  };

  return {
    id: adId,
    sourceUrl,
    status: endedAt ? "inactive" : "active",
    format: inferFormatFromPublicAd({ html, imageUrl, videoUrl }),
    platforms,
    startedAt,
    endedAt,
    reachMin: reach.min,
    reachMax: reach.max,
    imageUrl,
    videoUrl,
    thumbnailUrl: imageUrl,
    landingUrl: landingUrls[0] ?? null,
    primaryText,
    headline,
    hook: primaryText?.split(/(?<=[.!?])\s+/)[0]?.slice(0, 160) ?? headline,
    cta: ctaCandidates[0] ?? null,
    demographicSignals,
    ageRanges,
    genderSignals,
    audienceLocations,
    audienceInterests: [],
    raw: {
      source: "public_ad_library_html",
      sourceUrl,
      adId,
      extractedBodyCandidates: bodyCandidates.slice(0, 3),
      extractedHeadlineCandidates: headlineCandidates.slice(0, 3),
      extractedAssetUrls: { imageUrls: imageUrls.slice(0, 3), videoUrls: videoUrls.slice(0, 2), landingUrls: landingUrls.slice(0, 3) },
      textPreview: text.slice(0, 4000)
    }
  };
}

async function fetchPublicAdLibraryItems(sourceUrl: string) {
  const parsed = parseAdLibraryUrl(sourceUrl);
  const sourcePage = await fetchPublicAdLibraryHtml(sourceUrl);
  const ids = uniqueStrings([
    parsed.adId,
    ...extractAdIdsFromHtml(sourcePage.html)
  ]);
  const limit = Math.max(1, Math.min(100, Number(getOptionalEnv("COMPETITOR_CRAWL_LIMIT", "25")) || 25));
  const selectedIds = ids.slice(0, limit);

  if (selectedIds.length === 0) {
    return [publicAdItemFromHtml(sourcePage.html, sourcePage.finalUrl, null)];
  }

  const items: PublicAdLibraryItem[] = [];
  for (const adId of selectedIds) {
    try {
      const adPage = parsed.adId === adId ? sourcePage : await fetchPublicAdLibraryHtml(publicAdUrl(adId));
      items.push(publicAdItemFromHtml(adPage.html, adPage.finalUrl, adId));
    } catch {
      items.push({
        id: adId,
        sourceUrl: publicAdUrl(adId),
        status: "pending_public_enrichment",
        format: "unknown",
        platforms: [],
        startedAt: null,
        endedAt: null,
        reachMin: null,
        reachMax: null,
        imageUrl: null,
        videoUrl: null,
        thumbnailUrl: null,
        landingUrl: null,
        primaryText: null,
        headline: null,
        hook: null,
        cta: null,
        demographicSignals: { source: "public_ad_library_html", note: "Ad-ID gefunden, Detailseite konnte aber nicht ausgelesen werden." },
        ageRanges: [],
        genderSignals: [],
        audienceLocations: [],
        audienceInterests: [],
        raw: { source: "public_ad_library_html", adId, sourceUrl: publicAdUrl(adId), status: "detail_fetch_failed" }
      });
    }
  }

  return items;
}

function competitorCrawlLimit() {
  return Math.max(1, Math.min(100, Number(getOptionalEnv("COMPETITOR_CRAWL_LIMIT", "100")) || 100));
}

function competitorCrawlConcurrency() {
  return Math.max(1, Math.min(6, Number(getOptionalEnv("COMPETITOR_CRAWL_CONCURRENCY", "4")) || 4));
}

async function waitForBodyText(page: Page, predicate: (text: string) => boolean, timeout = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    if (predicate(text)) return text;
    await page.waitForTimeout(350);
  }
  return page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
}

async function extractBrowserAdCards(page: Page, sourceUrl: string, limit: number) {
  const response = await page.goto(normalizePublicAdLibraryUrl(sourceUrl), { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForBodyText(page, (text) => text.includes("Library ID:") || text.includes("No ads"), 15000);

  let lastCount = 0;
  let stableRounds = 0;
  const maxScrolls = Math.max(8, Math.min(40, Math.ceil(limit / 6)));
  for (let index = 0; index < maxScrolls; index += 1) {
    const count = await page.evaluate(() => {
      const ids = new Set<string>();
      for (const node of Array.from(document.querySelectorAll("div"))) {
        if (!(node instanceof HTMLElement)) continue;
        const match = node.innerText.match(/Library ID:\s*(\d{8,})/);
        if (match) ids.add(match[1]);
      }
      return ids.size;
    });
    if (count >= limit) break;
    stableRounds = count === lastCount ? stableRounds + 1 : 0;
    if (stableRounds >= 3 && count > 0) break;
    lastCount = count;
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(850);
  }

  const cards = await page.evaluate((cardLimit) => {
    const helper = {
      uniqueBrowserStrings(values: Array<string | null | undefined>) {
        return Array.from(new Set(values.filter(Boolean) as string[]));
      },

      isHttpUrl(value: string | null | undefined) {
        return Boolean(value && /^https?:\/\//i.test(value));
      },

      candidateFromElement(element: Element, url: string | null | undefined): MediaCandidate | null {
        if (!helper.isHttpUrl(url)) return null;
        const rect = element.getBoundingClientRect();
        const renderedWidth = Math.round(rect.width);
        const renderedHeight = Math.round(rect.height);
        const naturalWidth = element instanceof HTMLImageElement ? element.naturalWidth : 0;
        const naturalHeight = element instanceof HTMLImageElement ? element.naturalHeight : 0;
        const width = Math.max(renderedWidth, naturalWidth);
        const height = Math.max(renderedHeight, naturalHeight);
        const area = Math.max(renderedWidth * renderedHeight, naturalWidth * naturalHeight, width * height);
        const isTinySquare = renderedWidth <= 96 && renderedHeight <= 96 && Math.abs(renderedWidth - renderedHeight) <= 24;
        const isLargeEnough = (renderedWidth >= 120 && renderedHeight >= 90) || naturalWidth >= 220 || naturalHeight >= 220 || area >= 20000;
        if (isTinySquare || !isLargeEnough) return null;
        return { url: url as string, area, width, height };
      },

      urlsFromBackground(element: Element) {
        const matches = Array.from(window.getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g));
        return matches.map((match) => match[1]).filter(helper.isHttpUrl) as string[];
      }
    };

    type MediaCandidate = { url: string; area: number; width: number; height: number };

    const candidates = Array.from(document.querySelectorAll("div"))
      .flatMap((node) => {
        if (!(node instanceof HTMLElement)) return [];
        const text = node.innerText || "";
        const match = text.match(/Library ID:\s*(\d{8,})/);
        if (!match || !text.includes("Sponsored")) return [];
        return [{ node, id: match[1], text, length: text.length }];
      })
      .sort((a, b) => a.length - b.length);

    const byId = new Map<string, { node: HTMLElement; id: string; text: string; length: number }>();
    for (const candidate of candidates) {
      if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
    }

    return Array.from(byId.values()).slice(0, cardLimit).map((candidate) => ({
      id: candidate.id,
      text: candidate.text,
      images: (() => {
        const imageCandidates = [
          ...Array.from(candidate.node.querySelectorAll("img")).map((image) => helper.candidateFromElement(image, image.currentSrc || image.src)),
          ...Array.from(candidate.node.querySelectorAll("video")).map((video) => helper.candidateFromElement(video, video.poster)),
          ...Array.from(candidate.node.querySelectorAll("*")).flatMap((element) => helper.urlsFromBackground(element).map((url) => helper.candidateFromElement(element, url)))
        ]
          .filter((item): item is MediaCandidate => Boolean(item))
          .sort((a, b) => b.area - a.area || (b.width * b.height) - (a.width * a.height));

        return helper.uniqueBrowserStrings(imageCandidates.map((image) => image.url));
      })(),
      videos: helper.uniqueBrowserStrings(Array.from(candidate.node.querySelectorAll("video")).map((video) => video.currentSrc || video.src).filter((url) => /^https?:\/\//i.test(url))),
      links: helper.uniqueBrowserStrings(Array.from(candidate.node.querySelectorAll("a")).map((anchor) => anchor.href))
    }));
  }, limit);

  return { cards, pageStatus: response?.status() ?? null, finalUrl: page.url() };
}

async function targetAdButtonRect(page: Page, adId: string, label: string) {
  return page.evaluate(({ targetAdId, buttonLabel }) => {
    const matches = Array.from(document.querySelectorAll("div"))
      .flatMap((node) => {
        if (!(node instanceof HTMLElement)) return [];
        return [{ node, text: node.innerText || "" }];
      })
      .filter((item) => item.text.includes(`Library ID: ${targetAdId}`) && item.text.includes("Sponsored"))
      .sort((a, b) => a.text.length - b.text.length);

    for (const match of matches.slice(0, 6)) {
      const buttons = Array.from(match.node.querySelectorAll("[role='button'], button"));
      const button = buttons.find((node) => (node instanceof HTMLElement ? node.innerText || node.textContent || "" : "").includes(buttonLabel));
      if (!(button instanceof HTMLElement)) continue;
      button.scrollIntoView({ block: "center", inline: "center" });
      const box = button.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }

    return null;
  }, { targetAdId: adId, buttonLabel: label });
}

async function exactTextRect(page: Page, text: string) {
  return page.evaluate((targetText) => {
    const candidates = Array.from(document.querySelectorAll("[role='button'], button, div, span"))
      .flatMap((node) => {
        if (!(node instanceof HTMLElement)) return [];
        return [{ node, text: (node.innerText || node.textContent || "").trim() }];
      })
      .filter((item) => item.text === targetText)
      .map((item) => item.node);
    const node = candidates[candidates.length - 1] ?? null;
    if (!node) return null;
    node.scrollIntoView({ block: "center", inline: "center" });
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }, text);
}

async function extractRenderedAdMedia(page: Page, adId: string) {
  return page.evaluate((targetAdId) => {
    type MediaCandidate = { url: string; area: number; width: number; height: number };

    const helper = {
      uniqueBrowserStrings(values: Array<string | null | undefined>) {
        return Array.from(new Set(values.filter(Boolean) as string[]));
      },

      isHttpUrl(value: string | null | undefined) {
        return Boolean(value && /^https?:\/\//i.test(value));
      },

      candidateFromElement(element: Element, url: string | null | undefined): MediaCandidate | null {
        if (!helper.isHttpUrl(url)) return null;
        const rect = element.getBoundingClientRect();
        const renderedWidth = Math.round(rect.width);
        const renderedHeight = Math.round(rect.height);
        const naturalWidth = element instanceof HTMLImageElement ? element.naturalWidth : 0;
        const naturalHeight = element instanceof HTMLImageElement ? element.naturalHeight : 0;
        const width = Math.max(renderedWidth, naturalWidth);
        const height = Math.max(renderedHeight, naturalHeight);
        const area = Math.max(renderedWidth * renderedHeight, naturalWidth * naturalHeight, width * height);
        const isTinySquare = renderedWidth <= 96 && renderedHeight <= 96 && Math.abs(renderedWidth - renderedHeight) <= 24;
        const isLargeEnough = (renderedWidth >= 120 && renderedHeight >= 90) || naturalWidth >= 220 || naturalHeight >= 220 || area >= 20000;
        if (isTinySquare || !isLargeEnough) return null;
        return { url: url as string, area, width, height };
      },

      urlsFromBackground(element: Element) {
        const matches = Array.from(window.getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g));
        return matches.map((match) => match[1]).filter(helper.isHttpUrl) as string[];
      }
    };

    const scopedNodes = Array.from(document.querySelectorAll("div"))
      .flatMap((node) => {
        if (!(node instanceof HTMLElement)) return [];
        const text = node.innerText || "";
        if (!text.includes(`Library ID: ${targetAdId}`)) return [];
        return [node];
      })
      .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)
      .slice(0, 4);
    const roots = scopedNodes.length ? scopedNodes : [document.body];

    const imageCandidates = roots.flatMap((root) => [
      ...Array.from(root.querySelectorAll("img")).map((image) => helper.candidateFromElement(image, image.currentSrc || image.src)),
      ...Array.from(root.querySelectorAll("video")).map((video) => helper.candidateFromElement(video, video.poster)),
      ...Array.from(root.querySelectorAll("*")).flatMap((element) => helper.urlsFromBackground(element).map((url) => helper.candidateFromElement(element, url)))
    ])
      .filter((item): item is MediaCandidate => Boolean(item))
      .sort((a, b) => b.area - a.area || (b.width * b.height) - (a.width * a.height));

    const videos = roots.flatMap((root) => Array.from(root.querySelectorAll("video")).map((video) => video.currentSrc || video.src).filter(helper.isHttpUrl) as string[]);

    return {
      images: helper.uniqueBrowserStrings(imageCandidates.map((image) => image.url)),
      videos: helper.uniqueBrowserStrings(videos)
    };
  }, adId);
}

async function openEuTransparencyText(page: Page, adId: string) {
  await page.goto(publicAdUrl(adId), { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForBodyText(page, (text) => text.includes(`Library ID: ${adId}`), 18000);
  const mediaBeforeDetails = await extractRenderedAdMedia(page, adId).catch(() => ({ images: [], videos: [] }));

  let detailsRect = await targetAdButtonRect(page, adId, "See ad details");
  for (let attempt = 0; !detailsRect && attempt < 4; attempt += 1) {
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(600);
    detailsRect = await targetAdButtonRect(page, adId, "See ad details");
  }
  if (!detailsRect) throw new Error("See ad details button not found.");
  await page.mouse.click(detailsRect.x + detailsRect.width / 2, detailsRect.y + detailsRect.height / 2);
  await waitForBodyText(page, (text) => text.includes("Ad Details") && text.includes("Transparency by location"), 18000);
  const mediaAfterDetails = await extractRenderedAdMedia(page, adId).catch(() => ({ images: [], videos: [] }));

  const transparencyRect = await exactTextRect(page, "Transparency by location");
  if (!transparencyRect) throw new Error("Transparency by location section not found.");
  await page.mouse.click(transparencyRect.x + transparencyRect.width / 2, transparencyRect.y + transparencyRect.height / 2);
  const text = await waitForBodyText(page, (bodyText) => bodyText.includes("EU ad audience") && bodyText.includes("EU ad delivery"), 18000);
  return {
    text,
    media: {
      images: uniqueStrings([...mediaAfterDetails.images, ...mediaBeforeDetails.images]),
      videos: uniqueStrings([...mediaAfterDetails.videos, ...mediaBeforeDetails.videos])
    }
  };
}

async function enrichItemsWithEuTransparency(context: BrowserContext, items: PublicAdLibraryItem[], skippedIds: Set<string>, concurrency: number) {
  const refreshExistingMedia = getOptionalEnv("COMPETITOR_REFRESH_EXISTING_MEDIA", "1") !== "0";
  const targets = items.filter((item) => item.id && (!skippedIds.has(item.id) || refreshExistingMedia));
  let cursor = 0;
  let updated = 0;
  let failed = 0;

  async function worker() {
    const page = await context.newPage();
    try {
      while (cursor < targets.length) {
        const item = targets[cursor];
        cursor += 1;
        if (!item.id) continue;

        try {
          const detail = await openEuTransparencyText(page, item.id);
          const signals = parseEuTransparencySignals(detail.text);
          if (!signals) throw new Error("EU transparency section not parseable.");
          item.imageUrl = detail.media.images[0] ?? item.imageUrl;
          item.thumbnailUrl = detail.media.images[0] ?? item.thumbnailUrl;
          item.videoUrl = detail.media.videos[0] ?? item.videoUrl;
          item.reachMin = signals.euReach;
          item.reachMax = signals.euReach;
          item.demographicSignals = signals as unknown as JsonRecord;
          item.ageRanges = uniqueStrings([signals.targetAgeRange, ...signals.reachBreakdown.map((row) => row.ageRange)]);
          item.genderSignals = uniqueStrings([signals.targetGender, ...signals.reachBreakdown.map((row) => row.gender)]).map((value) => value.toLowerCase());
          item.audienceLocations = getCompetitorDeliveryLocations(signals as unknown as JsonRecord);
          item.raw = {
            ...item.raw,
            euTransparency: {
              source: signals.source,
              euReach: signals.euReach,
              targetAgeRange: signals.targetAgeRange,
              targetGender: signals.targetGender,
              targetLocations: signals.targetLocations,
              reachBreakdown: signals.reachBreakdown
            }
          };
          updated += 1;
        } catch (error) {
          failed += 1;
          item.raw = { ...item.raw, euTransparencyError: error instanceof Error ? error.message : "EU transparency crawl failed." };
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, targets.length)) }, () => worker()));
  return { updated, failed, skipped: refreshExistingMedia ? 0 : skippedIds.size, refreshExistingMedia };
}

async function fetchPublicAdLibraryItemsWithBrowser(sourceUrl: string, skippedEuTransparencyIds: Set<string>): Promise<BrowserCrawlResult> {
  const { chromium } = await import("playwright");
  const limit = competitorCrawlLimit();
  const concurrency = competitorCrawlConcurrency();
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-setuid-sandbox",
      "--no-sandbox"
    ]
  });
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1440, height: 1200 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9,de;q=0.8"
    }
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  try {
    const page = await context.newPage();
    const { cards, pageStatus, finalUrl } = await extractBrowserAdCards(page, sourceUrl, limit);
    await page.close().catch(() => {});

    const items = cards.map(parseBrowserAdCard);
    if (items.length === 0) throw new Error("Browser-Crawl fand keine Ad-Karten in der Meta Ad Library.");
    const euTransparency = await enrichItemsWithEuTransparency(context, items, skippedEuTransparencyIds, concurrency);

    return {
      items,
      raw: {
        crawler: "public_ad_library_browser",
        pageStatus,
        finalUrl,
        totalCards: cards.length,
        concurrency,
        euTransparency
      }
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function upsertPublicAdLibraryItem(clientId: string, source: SourceRow, item: PublicAdLibraryItem, cpmBase: Awaited<ReturnType<typeof ownCpm>>) {
  const supabase = createSupabaseServiceRoleClient();
  const lastSeenAt = new Date().toISOString();
  const estimates = estimateCreativeMetrics({
    reachMin: item.reachMin,
    reachMax: item.reachMax,
    startedAt: item.startedAt,
    endedAt: item.endedAt,
    cpm: cpmBase.cpm,
    cpmConfidence: cpmBase.confidence
  });
  const existing = item.id
    ? await supabase
        .from("competitor_creatives")
        .select("id,raw")
        .eq("client_id", clientId)
        .eq("ad_library_id", item.id)
        .maybeSingle()
    : { data: null, error: null };
  const existingRaw =
    existing.data?.raw && typeof existing.data.raw === "object" && !Array.isArray(existing.data.raw)
      ? (existing.data.raw as JsonRecord)
      : {};
  const payload = {
    client_id: clientId,
    competitor_id: source.competitor_id,
    source_id: source.id,
    source_url: item.sourceUrl,
    ad_library_id: item.id,
    status: item.status,
    format: item.format,
    platforms: item.platforms,
    started_at: item.startedAt,
    ended_at: item.endedAt,
    active_days: estimates.activeDays,
    reach_min: item.reachMin,
    reach_max: item.reachMax,
    reach_estimate: estimates.reachEstimate,
    estimated_cpm: estimates.estimatedCpm,
    estimated_spend: estimates.estimatedSpend,
    estimated_daily_spend: estimates.estimatedDailySpend,
    estimate_confidence: estimates.estimateConfidence,
    thumbnail_url: item.thumbnailUrl,
    video_url: item.videoUrl,
    image_url: item.imageUrl,
    landing_url: item.landingUrl,
    primary_text: item.primaryText,
    headline: item.headline,
    hook: item.hook,
    cta: item.cta,
    demographic_signals: item.demographicSignals,
    age_ranges: item.ageRanges,
    gender_signals: item.genderSignals,
    audience_locations: item.audienceLocations,
    audience_interests: item.audienceInterests,
    raw: {
      ...existingRaw,
      ...item.raw,
      lastSeenAt
    }
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

async function existingEuTransparencyAdIds(clientId: string, sourceId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("competitor_creatives")
    .select("ad_library_id")
    .eq("client_id", clientId)
    .eq("source_id", sourceId)
    .eq("demographic_signals->>source", "meta_eu_transparency");
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ ad_library_id: string | null }>).map((row) => row.ad_library_id).filter(Boolean) as string[]);
}

async function refreshExistingPublicAdMedia(clientId: string, sourceId: string, item: PublicAdLibraryItem) {
  if (!item.id) return false;
  const mediaPayload: Record<string, string> = {};
  if (item.thumbnailUrl) mediaPayload.thumbnail_url = item.thumbnailUrl;
  if (item.imageUrl) mediaPayload.image_url = item.imageUrl;
  if (item.videoUrl) mediaPayload.video_url = item.videoUrl;
  if (Object.keys(mediaPayload).length === 0) return false;

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("competitor_creatives")
    .update(mediaPayload)
    .eq("client_id", clientId)
    .eq("source_id", sourceId)
    .eq("ad_library_id", item.id);
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
    const skippedEuTransparencyIds = await existingEuTransparencyAdIds(clientId, sourceId);
    let pageId = parsed.pageId;
    if (typedSource.competitor_id) {
      const { data: competitor } = await supabase.from("competitors").select("meta_page_id,crawl_enabled").eq("id", typedSource.competitor_id).maybeSingle();
      if (competitor?.crawl_enabled === false) {
        throw new Error("Dieser Competitor ist in den Competitor Settings nicht zum Crawlen verbunden.");
      }
      if (!pageId) pageId = typeof competitor?.meta_page_id === "string" ? competitor.meta_page_id : null;
    }

    let crawlRaw: JsonRecord = {};
    let publicItems: PublicAdLibraryItem[];
    if (getOptionalEnv("COMPETITOR_BROWSER_CRAWL", "1") === "0") {
      publicItems = await fetchPublicAdLibraryItems(typedSource.url);
      crawlRaw = { crawler: "public_ad_library_html" };
    } else {
      try {
        const browserResult = await fetchPublicAdLibraryItemsWithBrowser(typedSource.url, skippedEuTransparencyIds);
        publicItems = browserResult.items;
        crawlRaw = browserResult.raw;
      } catch (browserError) {
        const browserErrorMessage = browserError instanceof Error ? browserError.message : "Browser-Crawl fehlgeschlagen.";
        try {
          publicItems = await fetchPublicAdLibraryItems(typedSource.url);
          crawlRaw = {
            crawler: "public_ad_library_html",
            browserError: browserErrorMessage
          };
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "HTML-Fallback fehlgeschlagen.";
          throw new Error(`Browser-Crawl fehlgeschlagen: ${browserErrorMessage}; HTML-Fallback fehlgeschlagen: ${fallbackMessage}`);
        }
      }
    }

    let imported = 0;
    let skippedExisting = 0;
    let refreshedMedia = 0;
    for (const item of publicItems) {
      if (item.id && skippedEuTransparencyIds.has(item.id) && item.demographicSignals.source !== "meta_eu_transparency") {
        if (await refreshExistingPublicAdMedia(clientId, sourceId, item)) refreshedMedia += 1;
        skippedExisting += 1;
        continue;
      }
      if (await upsertPublicAdLibraryItem(clientId, typedSource, item, cpmBase)) imported += 1;
    }

    if (imported === 0 && skippedExisting === 0) {
      throw new Error("Keine Ads importiert. Der oeffentliche Ad Library Link enthielt keine auslesbaren Ad-IDs oder Creative-Daten. Nutze einen konkreten Ad-Link oder ergaenze das Creative manuell ueber Advanced.");
    }

    await supabase
      .from("competitor_ad_library_sources")
      .update({
        status: "completed",
        error_message: null,
        last_checked_at: new Date().toISOString(),
        raw: {
          ...crawlRaw,
          imported,
          skippedExisting,
          refreshedMedia,
          pageId,
          adId: parsed.adId
        }
      })
      .eq("id", sourceId);
    revalidateCompetitorCaches();
    return getCompetitorOverview(clientId).catch(() => getCompetitorOverviewUncached(clientId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor Crawl fehlgeschlagen.";
    await supabase
      .from("competitor_ad_library_sources")
      .update({ status: "failed", error_message: message, last_checked_at: new Date().toISOString() })
      .eq("id", sourceId);
    revalidateCompetitorCaches();
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
  revalidateCompetitorCaches();
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
    targetAudience: stringValue(payload.targetAudience),
    ageSignal: stringValue(payload.ageSignal),
    audienceReasoning: stringValue(payload.audienceReasoning),
    thesis: stringValue(payload.thesis),
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

function truncateText(value: string, maxCharacters = 10000) {
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

function competitorVideoTranscriptContext(transcript: CreativeVideoTranscript | null, error: string | null) {
  const hasTranscript = transcript?.status === "completed" && Boolean(transcript.transcript);
  if (!hasTranscript) {
    return {
      status: transcript?.status ?? "missing",
      error: error ?? transcript?.errorMessage ?? null
    };
  }

  return {
    status: transcript.status,
    provider: transcript.provider,
    model: transcript.model,
    language: transcript.language,
    durationSeconds: transcript.durationSeconds,
    hookTranscript: getHookTranscript(transcript),
    sections: {
      hook: getTranscriptSection(transcript, "hook"),
      body: getTranscriptSection(transcript, "body"),
      ending: getTranscriptSection(transcript, "ending")
    },
    fullTranscript: truncateText(transcript.transcript ?? ""),
    firstSegments: transcript.segments.slice(0, 16)
  };
}

export async function analyzeCompetitorCreative(clientId: string, creativeId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: creative, error: creativeError }, { data: competitors }, cpmBase] = await Promise.all([
    supabase.from("competitor_creatives").select("*").eq("client_id", clientId).eq("id", creativeId).single(),
    supabase.from("competitors").select("id,client_id,name,website_url,meta_page_id,meta_ad_library_url,notes,crawl_enabled,created_at").eq("client_id", clientId),
    ownCpm(clientId)
  ]);
  if (creativeError || !creative) throw new Error(creativeError?.message ?? "Competitor Creative wurde nicht gefunden.");
  const typedCreative = creative as CreativeRow;
  const competitor = ((competitors ?? []) as CompetitorRow[]).find((item) => item.id === typedCreative.competitor_id) ?? null;
  let videoTranscript = mapRawCompetitorVideoTranscript(typedCreative.raw);
  let videoTranscriptError: string | null = null;
  const shouldTranscribeVideo = Boolean(typedCreative.video_url) && getOptionalEnv("COMPETITOR_TRANSCRIBE_VIDEOS_ON_ANALYSIS", "1") !== "0";

  if (shouldTranscribeVideo && !(videoTranscript?.status === "completed" && videoTranscript.transcript)) {
    try {
      videoTranscript = await transcribeCompetitorCreativeVideo(clientId, creativeId);
    } catch (error) {
      videoTranscriptError = error instanceof Error ? error.message : "Competitor Video konnte nicht transkribiert werden.";
    }
  }

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
    landingUrl: typedCreative.landing_url,
    videoUrl: typedCreative.video_url,
    videoTranscript: competitorVideoTranscriptContext(videoTranscript, videoTranscriptError),
    publicAudienceSignals: {
      demographicSignals: typedCreative.demographic_signals ?? {},
      ageRanges: stringArray(typedCreative.age_ranges),
      genderSignals: stringArray(typedCreative.gender_signals),
      audienceLocations: stringArray(typedCreative.audience_locations),
      audienceInterests: stringArray(typedCreative.audience_interests)
    }
  }, null, 2)}

Antworte exakt als JSON mit Keys:
hook, hookExplanation, body, ending, visualElements, detectedText, offer, angle, funnelStage, emotionScores, strengths, weaknesses, hypotheses, adaptationIdeas, targetAudience, ageSignal, audienceReasoning, thesis, rankingScore.

Regeln:
- hook ist nur der sichtbare oder angegebene Hook-Text, keine Analyse.
- Wenn videoTranscript.status "completed" ist, nutze das Transcript als primaere Quelle fuer hook, body, ending und detectedText. body soll das Hauptscript der UGC Ad zusammenfassen, ending den Schluss/CTA.
- Wenn ein Full Transcript vorhanden ist, darfst du das komplette Script in detectedText oder body strukturiert wiedergeben, aber nicht halluzinieren.
- emotionScores hat Keys curiosity, desire, trust, urgency, joy, fearOfMissingOut mit 0-100.
- adaptationIdeas sind konkrete Ideen, wie wir das Pattern fuer den Kunden adaptieren koennen, ohne zu kopieren.
- targetAudience und ageSignal duerfen echte Delivery-Daten nur behaupten, wenn publicAudienceSignals diese Daten enthalten. Sonst als "AI-Inferenz" formulieren.
- audienceReasoning erklaert knapp, ob die Zielgruppenannahme aus oeffentlichen Demografie-Signalen oder aus Copy/Visual/Offer abgeleitet ist.
- thesis ist die zentrale These, warum diese Ad funktionieren koennte, mit Bezug auf Hook, Angle, Emotion und Reach/Laufzeit.
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
      target_audience: generated.targetAudience || null,
      age_signal: generated.ageSignal || null,
      audience_reasoning: generated.audienceReasoning || null,
      thesis: generated.thesis || null,
      ranking_score: generated.rankingScore,
      raw: {
        ...(generated as unknown as JsonRecord),
        videoTranscript: competitorVideoTranscriptContext(videoTranscript, videoTranscriptError)
      }
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "Competitor Analyse konnte nicht gespeichert werden.");
  revalidateCompetitorCaches();
  return getCompetitorOverview(clientId);
}

export async function analyzeCompetitorCreatives(clientId: string, creativeIds: string[]) {
  const uniqueIds = uniqueStrings(creativeIds).slice(0, 100);
  if (uniqueIds.length === 0) throw new Error("Keine Competitor Creatives fuer die Analyse ausgewaehlt.");

  const results: Array<{ creativeId: string; status: "completed" | "failed"; error?: string }> = [];
  for (const creativeId of uniqueIds) {
    try {
      await analyzeCompetitorCreative(clientId, creativeId);
      results.push({ creativeId, status: "completed" });
    } catch (error) {
      results.push({ creativeId, status: "failed", error: error instanceof Error ? error.message : "Analyse fehlgeschlagen." });
    }
  }

  revalidateCompetitorCaches();
  return {
    total: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
    results
  };
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
