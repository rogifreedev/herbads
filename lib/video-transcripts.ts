import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS, VIDEO_TRANSCRIPT_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

type CreativeRow = {
  id: string;
  client_id: string;
  ad_account_id: string;
  meta_creative_id: string;
  creative_type: string | null;
  video_id: string | null;
  video_url: string | null;
  video_embed_url: string | null;
  video_permalink_url: string | null;
  raw: JsonRecord | null;
};

type CompetitorCreativeVideoRow = {
  id: string;
  client_id: string;
  video_url: string | null;
  raw: JsonRecord | null;
};

type MetaAdAccountRow = {
  meta_account_id: string;
};

export type TranscriptSegment = {
  start: number | null;
  end: number | null;
  text: string;
};

export type CreativeVideoTranscript = {
  id: string;
  provider: string;
  model: string;
  status: string;
  language: string | null;
  transcript: string | null;
  segments: TranscriptSegment[];
  durationSeconds: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type TranscriptRow = {
  id: string;
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

type OpenAiTranscriptionResponse = {
  text?: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
  error?: { message?: string };
};

type MetaVideoResponse = {
  source?: string;
  error?: { message?: string };
};

type MetaPageResponse = {
  access_token?: string;
  error?: { message?: string };
};

type MetaAdVideoListResponse = {
  data?: Array<{ id?: string; source?: string }>;
  error?: { message?: string };
};

type VideoSourceResult = {
  url: string;
  videoId: string | null;
  resolver: string;
  persistToCreative?: boolean;
};

const COMPETITOR_TRANSCRIPT_RAW_KEY = "competitorVideoTranscript";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const item = segment as JsonRecord;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return null;

      return {
        start: toNumber(item.start),
        end: toNumber(item.end),
        text
      };
    })
    .filter((segment): segment is TranscriptSegment => Boolean(segment));
}

function mapTranscript(row: TranscriptRow): CreativeVideoTranscript {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    status: row.status,
    language: row.language,
    transcript: row.transcript,
    segments: normalizeSegments(row.segments),
    durationSeconds: toNumber(row.duration_seconds),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapRawCompetitorVideoTranscript(raw: unknown): CreativeVideoTranscript | null {
  const source = asRecord(raw);
  const record = asRecord(source?.[COMPETITOR_TRANSCRIPT_RAW_KEY]);
  if (!record) return null;

  const status = stringValue(record.status);
  const model = stringValue(record.model);
  const provider = stringValue(record.provider);
  if (!status || !model || !provider) return null;

  return {
    id: stringValue(record.id) ?? "competitor-video-transcript",
    provider,
    model,
    status,
    language: stringValue(record.language),
    transcript: stringValue(record.transcript),
    segments: normalizeSegments(record.segments),
    durationSeconds: toNumber(record.durationSeconds),
    errorMessage: stringValue(record.errorMessage),
    createdAt: stringValue(record.createdAt) ?? new Date(0).toISOString(),
    updatedAt: stringValue(record.updatedAt) ?? new Date(0).toISOString()
  };
}

function extensionForContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "mp4";
}

function maxTranscriptFileBytes() {
  const megabytes = Number(getOptionalEnv("CREATIVE_TRANSCRIPT_MAX_FILE_MB", "24"));
  return (Number.isFinite(megabytes) ? megabytes : 24) * 1024 * 1024;
}

async function downloadVideo(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    }
  });
  if (!response.ok) throw new Error(`Video konnte nicht geladen werden (${response.status}).`);

  const maxBytes = maxTranscriptFileBytes();
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new Error(`Video ist zu gross fuer Transkription (${Math.round(contentLength / 1024 / 1024)} MB).`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Video ist zu gross fuer Transkription (${Math.round(buffer.byteLength / 1024 / 1024)} MB).`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
  return {
    buffer,
    contentType,
    bytes: buffer.byteLength,
    filename: `creative-video.${extensionForContentType(contentType)}`
  };
}

function transcriptionModel() {
  return getOptionalEnv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1");
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\\//g, "/");
  }
}

function normalizeExtractedVideoUrl(value: string) {
  const decoded = decodeHtmlEntities(decodeJsonString(value)).replace(/\\u0025/g, "%").replace(/\\/g, "");
  try {
    const url = new URL(decoded);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractEmbedVideoSources(html: string) {
  const sources: string[] = [];
  const push = (value: string | null) => {
    if (value && !sources.includes(value)) sources.push(value);
  };

  for (const key of ["hd_src", "sd_src"]) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "g");
    for (const match of html.matchAll(pattern)) {
      push(normalizeExtractedVideoUrl(match[1]));
    }
  }

  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+?\.mp4[^"'<>\s]*/g)) {
    push(normalizeExtractedVideoUrl(match[0]));
  }

  return sources;
}

function extractVideoIdCandidates(creative: CreativeRow) {
  const raw = asRecord(creative.raw);
  const objectStorySpec = asRecord(raw?.object_story_spec);
  const videoData = asRecord(objectStorySpec?.video_data);
  const assetFeedSpec = asRecord(raw?.asset_feed_spec);
  const assetVideos = Array.isArray(assetFeedSpec?.videos) ? assetFeedSpec.videos : [];

  return uniqueValues([
    stringValue(raw?.video_id),
    stringValue(videoData?.video_id),
    ...assetVideos.map((video) => stringValue(asRecord(video)?.video_id)),
    creative.video_id
  ]);
}

function extractPageIdCandidate(creative: CreativeRow) {
  const raw = asRecord(creative.raw);
  const objectStorySpec = asRecord(raw?.object_story_spec);
  return stringValue(objectStorySpec?.page_id);
}

async function fetchMetaVideoSource(videoId: string) {
  const token = getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!token) return null;

  const apiVersion = getOptionalEnv("META_API_VERSION", "v20.0");
  const url = `https://graph.facebook.com/${apiVersion}/${videoId}?fields=source&access_token=${token}`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as MetaVideoResponse;

  if (!response.ok || payload.error) {
    return null;
  }

  return payload.source ?? null;
}

async function fetchMetaPageAccessToken(pageId: string) {
  const token = getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!token) return null;

  const apiVersion = getOptionalEnv("META_API_VERSION", "v20.0");
  const url = `https://graph.facebook.com/${apiVersion}/${pageId}?fields=access_token&access_token=${token}`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as MetaPageResponse;

  if (!response.ok || payload.error) {
    return null;
  }

  return payload.access_token ?? null;
}

async function fetchMetaVideoSourceWithToken(videoId: string, accessToken: string) {
  const apiVersion = getOptionalEnv("META_API_VERSION", "v20.0");
  const url = `https://graph.facebook.com/${apiVersion}/${videoId}?fields=source&access_token=${accessToken}`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as MetaVideoResponse;

  if (!response.ok || payload.error) {
    return null;
  }

  return payload.source ?? null;
}

async function fetchMetaAdVideoSource(metaAccountId: string, videoId: string) {
  const token = getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!token) return null;

  const apiVersion = getOptionalEnv("META_API_VERSION", "v20.0");
  const filtering = encodeURIComponent(JSON.stringify([{ field: "id", operator: "IN", value: [videoId] }]));
  const url = `https://graph.facebook.com/${apiVersion}/${metaAccountId}/advideos?fields=id,source&filtering=${filtering}&limit=1&access_token=${token}`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as MetaAdVideoListResponse;

  if (!response.ok || payload.error) {
    return null;
  }

  return payload.data?.[0]?.source ?? null;
}

async function fetchFacebookEmbedVideoSource(embedUrl: string | null) {
  if (!embedUrl) return null;
  const response = await fetch(embedUrl, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    }
  });

  if (!response.ok) return null;
  const html = await response.text();
  return extractEmbedVideoSources(html)[0] ?? null;
}

function facebookEmbedUrlFromPermalink(permalinkUrl: string | null) {
  if (!permalinkUrl) return null;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(permalinkUrl)}`;
}

async function resolveVideoSource(creative: CreativeRow, metaAccount: MetaAdAccountRow | null, options: { includeStoredVideoUrl?: boolean } = {}): Promise<VideoSourceResult | null> {
  if (options.includeStoredVideoUrl !== false && creative.video_url) {
    return { url: creative.video_url, videoId: creative.video_id, resolver: "stored_creative_video_url" };
  }

  const videoIds = extractVideoIdCandidates(creative);

  for (const videoId of videoIds) {
    const source = await fetchMetaVideoSource(videoId);
    if (source) return { url: source, videoId, resolver: "meta_video_source" };
  }

  if (metaAccount?.meta_account_id) {
    for (const videoId of videoIds) {
      const source = await fetchMetaAdVideoSource(metaAccount.meta_account_id, videoId);
      if (source) return { url: source, videoId, resolver: "meta_advideos_source" };
    }
  }

  const pageId = extractPageIdCandidate(creative);
  if (pageId) {
    const pageAccessToken = await fetchMetaPageAccessToken(pageId);
    if (pageAccessToken) {
      for (const videoId of videoIds) {
        const source = await fetchMetaVideoSourceWithToken(videoId, pageAccessToken);
        if (source) return { url: source, videoId, resolver: "meta_page_video_source" };
      }
    }
  }

  const embedSource = await fetchFacebookEmbedVideoSource(creative.video_embed_url ?? facebookEmbedUrlFromPermalink(creative.video_permalink_url));
  if (embedSource) return { url: embedSource, videoId: creative.video_id, resolver: "facebook_embed_html_source", persistToCreative: false };

  return null;
}

async function downloadResolvedVideo(creative: CreativeRow, metaAccount: MetaAdAccountRow | null, source: VideoSourceResult) {
  try {
    return { source, video: await downloadVideo(source.url) };
  } catch (error) {
    if (source.resolver !== "stored_creative_video_url") throw error;
    const fallbackSource = await resolveVideoSource(creative, metaAccount, { includeStoredVideoUrl: false });
    if (!fallbackSource) throw error;
    return { source: fallbackSource, video: await downloadVideo(fallbackSource.url) };
  }
}

async function callOpenAiTranscription(video: Awaited<ReturnType<typeof downloadVideo>>) {
  const apiKey = getOptionalEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY fehlt. Bitte fuer Video-Transkription in .env.local setzen.");

  const model = transcriptionModel();
  const formData = new FormData();
  formData.append("file", new File([video.buffer], video.filename, { type: video.contentType }));
  formData.append("model", model);
  formData.append("response_format", model === "whisper-1" ? "verbose_json" : "json");

  if (model === "whisper-1") {
    formData.append("timestamp_granularities[]", "segment");
  }

  const language = getOptionalEnv("CREATIVE_TRANSCRIPT_LANGUAGE");
  if (language) formData.append("language", language);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });
  const payload = (await response.json()) as OpenAiTranscriptionResponse;

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "OpenAI Transkription fehlgeschlagen.");
  }

  return {
    provider: "openai",
    model,
    text: payload.text?.trim() ?? "",
    language: payload.language ?? language ?? null,
    duration: toNumber(payload.duration),
    segments: normalizeSegments(payload.segments ?? [])
  };
}

export async function transcribeUploadedVideoFile(file: File) {
  const maxBytes = maxTranscriptFileBytes();
  if (file.size > maxBytes) {
    throw new Error(`Video ist zu gross fuer Transkription (${Math.round(file.size / 1024 / 1024)} MB).`);
  }

  const buffer = await file.arrayBuffer();
  const contentType = file.type || "video/mp4";
  return callOpenAiTranscription({
    buffer,
    contentType,
    bytes: buffer.byteLength,
    filename: file.name || `prediction-video.${extensionForContentType(contentType)}`
  });
}

export function getHookTranscript(transcript: CreativeVideoTranscript | null, seconds = 5) {
  if (!transcript?.transcript) return null;

  const timedSegments = transcript.segments.filter((segment) => segment.start !== null);
  if (timedSegments.length > 0) {
    const hook = timedSegments
      .filter((segment) => (segment.start ?? 0) < seconds)
      .map((segment) => segment.text)
      .join(" ")
      .trim();

    if (hook) return hook;
  }

  const words = transcript.transcript.trim().split(/\s+/).slice(0, 45).join(" ");
  return words || null;
}

async function getLatestCreativeVideoTranscriptUncached(clientId: string, creativeId: string): Promise<{ transcript: CreativeVideoTranscript | null; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("creative_video_transcripts")
      .select("id,provider,model,status,language,transcript,segments,duration_seconds,error_message,created_at,updated_at")
      .eq("client_id", clientId)
      .eq("creative_id", creativeId)
      .maybeSingle();

    if (error) return { transcript: null, error: error.message };
    return { transcript: data ? mapTranscript(data as TranscriptRow) : null, error: null };
  } catch (error) {
    return { transcript: null, error: error instanceof Error ? error.message : "Transcript konnte nicht geladen werden." };
  }
}

const getLatestCreativeVideoTranscriptCached = unstable_cache(
  getLatestCreativeVideoTranscriptUncached,
  ["latest-creative-video-transcript-v1"],
  { revalidate: 120, tags: [CACHE_TAGS.videoTranscripts] }
);

export async function getLatestCreativeVideoTranscript(clientId: string, creativeId: string): Promise<{ transcript: CreativeVideoTranscript | null; error: string | null }> {
  return getLatestCreativeVideoTranscriptCached(clientId, creativeId);
}

export async function transcribeCreativeVideo(clientId: string, creativeId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: creative, error: creativeError } = await supabase
    .from("creatives")
    .select("id,client_id,ad_account_id,meta_creative_id,creative_type,video_id,video_url,video_embed_url,video_permalink_url,raw")
    .eq("client_id", clientId)
    .eq("id", creativeId)
    .maybeSingle();

  if (creativeError) throw new Error(creativeError.message);
  if (!creative) throw new Error("Creative wurde nicht gefunden.");

  const creativeRow = creative as CreativeRow;
  const model = transcriptionModel();
  const { data: metaAccount } = await supabase
    .from("meta_ad_accounts")
    .select("meta_account_id")
    .eq("id", creativeRow.ad_account_id)
    .maybeSingle();
  const source = await resolveVideoSource(creativeRow, (metaAccount ?? null) as MetaAdAccountRow | null);

  if (!source) {
    throw new Error("Dieses Creative hat keinen direkten Video-Download und Meta lieferte keine transkribierbare Video-Quelle.");
  }

  await supabase.from("creative_video_transcripts").upsert(
    {
      client_id: clientId,
      creative_id: creativeId,
      provider: "openai",
      model,
      status: "processing",
      error_message: null
    },
    { onConflict: "creative_id" }
  );

  try {
    const resolved = await downloadResolvedVideo(creativeRow, (metaAccount ?? null) as MetaAdAccountRow | null, source);
    const video = resolved.video;
    const finalSource = resolved.source;
    const result = await callOpenAiTranscription(video);

    if (!creativeRow.video_url && finalSource.persistToCreative !== false) {
      await supabase.from("creatives").update({ video_url: finalSource.url }).eq("id", creativeId);
    }

    const { data, error } = await supabase
      .from("creative_video_transcripts")
      .upsert(
        {
          client_id: clientId,
          creative_id: creativeId,
          provider: result.provider,
          model: result.model,
          status: "completed",
          language: result.language,
          transcript: result.text || null,
          segments: result.segments,
          duration_seconds: result.duration,
          source_url: finalSource.url,
          source_content_type: video.contentType,
          source_bytes: video.bytes,
          error_message: null,
          raw: {
            metaCreativeId: creativeRow.meta_creative_id,
            videoId: creativeRow.video_id,
            sourceVideoId: finalSource.videoId,
            sourceResolver: finalSource.resolver,
            videoEmbedUrl: creativeRow.video_embed_url,
            videoPermalinkUrl: creativeRow.video_permalink_url
          }
        },
        { onConflict: "creative_id" }
      )
      .select("id,provider,model,status,language,transcript,segments,duration_seconds,error_message,created_at,updated_at")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Transcript konnte nicht gespeichert werden.");
    revalidateCacheTags(...VIDEO_TRANSCRIPT_CACHE_TAGS);
    return mapTranscript(data as TranscriptRow);
  } catch (error) {
    await supabase.from("creative_video_transcripts").upsert(
      {
        client_id: clientId,
        creative_id: creativeId,
        provider: "openai",
        model,
        status: "failed",
        error_message: error instanceof Error ? error.message : "Transkription fehlgeschlagen."
      },
      { onConflict: "creative_id" }
    );

    revalidateCacheTags(...VIDEO_TRANSCRIPT_CACHE_TAGS);
    throw error;
  }
}

function competitorTranscriptRecord(input: {
  id: string;
  provider: string;
  model: string;
  status: string;
  language?: string | null;
  transcript?: string | null;
  segments?: TranscriptSegment[];
  durationSeconds?: number | null;
  sourceUrl?: string | null;
  sourceContentType?: string | null;
  sourceBytes?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  raw?: JsonRecord;
}) {
  return {
    id: input.id,
    provider: input.provider,
    model: input.model,
    status: input.status,
    language: input.language ?? null,
    transcript: input.transcript ?? null,
    segments: input.segments ?? [],
    durationSeconds: input.durationSeconds ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceContentType: input.sourceContentType ?? null,
    sourceBytes: input.sourceBytes ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    raw: input.raw ?? {}
  };
}

async function updateCompetitorCreativeTranscriptRaw(
  clientId: string,
  creativeId: string,
  raw: JsonRecord,
  transcript: ReturnType<typeof competitorTranscriptRecord>
) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("competitor_creatives")
    .update({ raw: { ...raw, [COMPETITOR_TRANSCRIPT_RAW_KEY]: transcript } })
    .eq("client_id", clientId)
    .eq("id", creativeId);

  if (error) throw new Error(error.message);
}

export async function getLatestCompetitorCreativeVideoTranscript(clientId: string, creativeId: string): Promise<{ transcript: CreativeVideoTranscript | null; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("competitor_creatives")
      .select("raw")
      .eq("client_id", clientId)
      .eq("id", creativeId)
      .maybeSingle();

    if (error) return { transcript: null, error: error.message };
    return { transcript: mapRawCompetitorVideoTranscript((data as { raw?: unknown } | null)?.raw), error: null };
  } catch (error) {
    return { transcript: null, error: error instanceof Error ? error.message : "Competitor Transcript konnte nicht geladen werden." };
  }
}

export async function transcribeCompetitorCreativeVideo(clientId: string, creativeId: string, options: { force?: boolean } = {}) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: creative, error: creativeError } = await supabase
    .from("competitor_creatives")
    .select("id,client_id,video_url,raw")
    .eq("client_id", clientId)
    .eq("id", creativeId)
    .maybeSingle();

  if (creativeError) throw new Error(creativeError.message);
  if (!creative) throw new Error("Competitor Creative wurde nicht gefunden.");

  const creativeRow = creative as CompetitorCreativeVideoRow;
  const raw = asRecord(creativeRow.raw) ?? {};
  const existing = mapRawCompetitorVideoTranscript(raw);
  if (!options.force && existing?.status === "completed" && existing.transcript) return existing;
  if (!creativeRow.video_url) throw new Error("Dieses Competitor Creative hat keine direkte Video-URL fuer Transkription.");

  const model = transcriptionModel();
  const now = new Date().toISOString();
  const transcriptId = existing?.id ?? `competitor-${creativeId}`;
  await updateCompetitorCreativeTranscriptRaw(
    clientId,
    creativeId,
    raw,
    competitorTranscriptRecord({
      id: transcriptId,
      provider: "openai",
      model,
      status: "processing",
      createdAt: existing?.createdAt && existing.createdAt !== new Date(0).toISOString() ? existing.createdAt : now,
      updatedAt: now
    })
  );

  try {
    const video = await downloadVideo(creativeRow.video_url);
    const result = await callOpenAiTranscription(video);
    const completed = competitorTranscriptRecord({
      id: transcriptId,
      provider: result.provider,
      model: result.model,
      status: "completed",
      language: result.language,
      transcript: result.text || null,
      segments: result.segments,
      durationSeconds: result.duration,
      sourceUrl: creativeRow.video_url,
      sourceContentType: video.contentType,
      sourceBytes: video.bytes,
      errorMessage: null,
      createdAt: existing?.createdAt && existing.createdAt !== new Date(0).toISOString() ? existing.createdAt : now,
      updatedAt: new Date().toISOString(),
      raw: {
        sourceResolver: "competitor_creative_video_url"
      }
    });

    await updateCompetitorCreativeTranscriptRaw(clientId, creativeId, raw, completed);
    revalidateCacheTags(...VIDEO_TRANSCRIPT_CACHE_TAGS);
    return mapRawCompetitorVideoTranscript({ [COMPETITOR_TRANSCRIPT_RAW_KEY]: completed })!;
  } catch (error) {
    const failed = competitorTranscriptRecord({
      id: transcriptId,
      provider: "openai",
      model,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Competitor Transkription fehlgeschlagen.",
      createdAt: existing?.createdAt && existing.createdAt !== new Date(0).toISOString() ? existing.createdAt : now,
      updatedAt: new Date().toISOString()
    });
    await updateCompetitorCreativeTranscriptRaw(clientId, creativeId, raw, failed);
    revalidateCacheTags(...VIDEO_TRANSCRIPT_CACHE_TAGS);
    throw error;
  }
}
