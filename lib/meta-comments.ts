import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

type CreativeRelation = { id: string; name: string | null; raw: JsonRecord | null };
type AdRow = {
  id: string;
  ad_account_id: string;
  creative_id: string | null;
  name: string | null;
  effective_status: string | null;
  creatives: CreativeRelation | CreativeRelation[] | null;
};
type StorySource = {
  storyId: string;
  pageId: string;
  adAccountId: string;
  adId: string;
  creativeId: string | null;
};
type SyncStateRow = { object_story_id: string; last_synced_at: string | null };
type MetaComment = {
  id?: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string };
  like_count?: number;
  comment_count?: number;
  parent?: { id?: string };
  comments?: { data?: MetaComment[] };
};
type MetaPage = { data?: MetaComment[]; paging?: { next?: string } };
type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
};

export type MetaCommentListItem = {
  id: string;
  metaCommentId: string;
  message: string;
  commenterName: string | null;
  likeCount: number;
  replyCount: number;
  commentCreatedAt: string | null;
  aiStatus: string;
  isWordingCandidate: boolean;
  wordingScore: number | null;
  wordingReason: string | null;
  suggestedWording: string | null;
  themes: string[];
  adId: string | null;
  adName: string | null;
  creativeId: string | null;
  creativeName: string | null;
};

export type MetaCommentsOverview = {
  comments: MetaCommentListItem[];
  totals: { comments: number; candidates: number; analyzed: number; pending: number };
  sync: { stories: number; failedStories: number; lastSyncedAt: string | null; lastError: string | null };
  error: string | null;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function creativeRelation(value: AdRow["creatives"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function textFromContent(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => record(item).text).filter((value): value is string => typeof value === "string").join("\n");
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("OpenRouter hat kein gueltiges JSON geliefert.");
  return JSON.parse(cleaned.slice(start, end + 1)) as JsonRecord;
}

function metaToken() {
  const token = getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!token) throw new Error("META_SYSTEM_USER_ACCESS_TOKEN fehlt.");
  return token;
}

async function fetchMetaPage(url: URL | string, accessToken = metaToken()): Promise<MetaPage> {
  const requestUrl = typeof url === "string" ? new URL(url) : url;
  if (!requestUrl.searchParams.has("access_token")) requestUrl.searchParams.set("access_token", accessToken);
  const response = await fetch(requestUrl, { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as MetaPage & { error?: { message?: string } };
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `Meta Kommentare konnten nicht geladen werden (${response.status}).`);
  return payload;
}

function flattenComments(comments: MetaComment[]) {
  const flattened: MetaComment[] = [];
  for (const comment of comments) {
    flattened.push(comment);
    for (const reply of comment.comments?.data ?? []) {
      flattened.push({ ...reply, parent: reply.parent ?? (comment.id ? { id: comment.id } : undefined) });
    }
  }
  return flattened;
}

async function fetchStoryComments(storyId: string, since: string | null, accessToken: string) {
  const version = getOptionalEnv("META_API_VERSION", "v20.0");
  const url = new URL(`https://graph.facebook.com/${version}/${storyId}/comments`);
  url.searchParams.set("fields", "id,message,created_time,from{id,name},like_count,comment_count,parent{id},comments.limit(100){id,message,created_time,from{id,name},like_count,comment_count,parent{id}}");
  url.searchParams.set("filter", "stream");
  url.searchParams.set("order", "reverse_chronological");
  url.searchParams.set("limit", "100");
  if (since) {
    const timestamp = Math.max(0, Math.floor(new Date(since).getTime() / 1000) - 300);
    url.searchParams.set("since", String(timestamp));
  }

  const comments: MetaComment[] = [];
  let next: string | null = url.toString();
  let page = 0;
  const maxPages = Math.max(1, Number(getOptionalEnv("META_COMMENTS_MAX_PAGES_PER_STORY", "20")) || 20);
  while (next && page < maxPages) {
    const payload = await fetchMetaPage(next, accessToken);
    comments.push(...flattenComments(payload.data ?? []));
    next = payload.paging?.next ?? null;
    page += 1;
  }
  return comments;
}

function storyCommentsRelativeUrl(storyId: string, since: string | null) {
  const version = getOptionalEnv("META_API_VERSION", "v20.0");
  const params = new URLSearchParams({
    fields: "id,message,created_time,from{id,name},like_count,comment_count,parent{id},comments.limit(100){id,message,created_time,from{id,name},like_count,comment_count,parent{id}}",
    filter: "stream",
    order: "reverse_chronological",
    limit: "100"
  });
  if (since) params.set("since", String(Math.max(0, Math.floor(new Date(since).getTime() / 1000) - 300)));
  return `${version}/${storyId}/comments?${params.toString()}`;
}

async function fetchStoryCommentsBatch(items: Array<{ source: StorySource; since: string | null }>, accessToken: string) {
  const body = new URLSearchParams({
    access_token: accessToken,
    include_headers: "false",
    batch: JSON.stringify(items.map((item) => ({ method: "GET", relative_url: storyCommentsRelativeUrl(item.source.storyId, item.since) })))
  });
  const response = await fetch("https://graph.facebook.com/", { method: "POST", body, cache: "no-store" });
  const payload = await response.json().catch(() => null) as Array<{ code?: number; body?: string }> | { error?: { message?: string } } | null;
  if (!response.ok || !Array.isArray(payload)) {
    const message = payload && !Array.isArray(payload) ? payload.error?.message : null;
    throw new Error(message ?? "Meta Kommentar-Batch konnte nicht geladen werden.");
  }

  return Promise.all(payload.map(async (result, index) => {
    const source = items[index].source;
    const parsed = result.body ? JSON.parse(result.body) as MetaPage & { error?: { message?: string } } : {};
    if ((result.code ?? 500) >= 400 || parsed.error) throw new Error(`${source.storyId}: ${parsed.error?.message ?? "Meta Story konnte nicht gelesen werden."}`);
    const comments = flattenComments(parsed.data ?? []);
    let next = parsed.paging?.next ?? null;
    let page = 1;
    const maxPages = Math.max(1, Number(getOptionalEnv("META_COMMENTS_MAX_PAGES_PER_STORY", "20")) || 20);
    while (next && page < maxPages) {
      const nextPage = await fetchMetaPage(next, accessToken);
      comments.push(...flattenComments(nextPage.data ?? []));
      next = nextPage.paging?.next ?? null;
      page += 1;
    }
    return { source, comments };
  }));
}

async function resolvePageAccessToken(pageId: string) {
  const version = getOptionalEnv("META_API_VERSION", "v20.0");
  const url = new URL(`https://graph.facebook.com/${version}/${pageId}`);
  url.searchParams.set("fields", "access_token");
  url.searchParams.set("access_token", metaToken());
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error?: { message?: string } };
  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error?.message ?? `Kein Page Access Token fuer Seite ${pageId} verfuegbar.`);
  }
  return payload.access_token;
}

async function loadStorySources(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("meta_ads")
    .select("id,ad_account_id,creative_id,name,effective_status,creatives(id,name,raw)")
    .eq("client_id", clientId)
    .not("creative_id", "is", null)
    .range(0, 9999);
  if (error) throw new Error(error.message);

  const sources = new Map<string, StorySource>();
  for (const ad of (data ?? []) as AdRow[]) {
    const creative = creativeRelation(ad.creatives);
    const storyId = creative?.raw && typeof creative.raw.effective_object_story_id === "string"
      ? creative.raw.effective_object_story_id.trim()
      : "";
    if (!storyId || sources.has(storyId)) continue;
    const pageId = storyId.split("_")[0];
    if (!pageId) continue;
    sources.set(storyId, { storyId, pageId, adAccountId: ad.ad_account_id, adId: ad.id, creativeId: ad.creative_id });
  }
  return [...sources.values()];
}

async function analyzePendingComments(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const maxComments = Math.max(1, Number(getOptionalEnv("META_COMMENTS_AI_LIMIT", "200")) || 200);
  const { data, error } = await supabase
    .from("meta_comments")
    .select("id,message")
    .eq("client_id", clientId)
    .eq("ai_status", "pending")
    .order("comment_created_at", { ascending: false })
    .limit(maxComments);
  if (error) throw new Error(error.message);
  if (!data?.length) return { analyzed: 0, candidates: 0 };

  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY fehlt.");
  const model = getOptionalEnv("OPENROUTER_COMMENT_MODEL", getOptionalEnv("OPENROUTER_TEXT_MODEL", "openai/gpt-5.2"));
  let analyzed = 0;
  let candidates = 0;

  for (let offset = 0; offset < data.length; offset += 40) {
    const batch = data.slice(offset, offset + 40);
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
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Du analysierst Kundenkommentare fuer Performance Creatives. Antworte ausschliesslich als valides JSON. Markiere nur Formulierungen, echte Einwaende, Nutzenargumente oder Woerter der Zielgruppe, die als Inspiration taugen. Erfinde keine Aussagen und uebernimm keine personenbezogenen Daten." },
          { role: "user", content: `Bewerte jeden Kommentar. Ergebnis: {\"results\":[{\"id\":\"...\",\"score\":0-100,\"candidate\":true|false,\"reason\":\"kurz\",\"suggestedWording\":\"creative-taugliche Formulierung oder leer\",\"themes\":[\"...\"]}]}. Candidate erst ab substanziellem Insight, nicht fuer Spam, reine Emojis, Tags, Supportfragen ohne Sprachwert oder Beleidigungen. Kommentare:\n${JSON.stringify(batch.map((item) => ({ id: item.id, text: item.message })))}` }
        ]
      })
    });
    const payload = await response.json().catch(() => ({})) as OpenRouterResponse;
    if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "OpenRouter Kommentaranalyse fehlgeschlagen.");
    const parsed = extractJsonObject(textFromContent(payload.choices?.[0]?.message?.content));
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    const byId = new Map(results.map((item) => {
      const value = record(item);
      return [String(value.id ?? ""), value] as const;
    }));
    const analyzedAt = new Date().toISOString();

    const updates = batch.map(async (item) => {
      const result = byId.get(item.id);
      if (!result) return null;
      const score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 0)));
      const isCandidate = result.candidate === true && score >= 60;
      const themes = Array.isArray(result.themes) ? result.themes.filter((value): value is string => typeof value === "string").slice(0, 8) : [];
      const { error: updateError } = await supabase.from("meta_comments").update({
        ai_status: "analyzed",
        is_wording_candidate: isCandidate,
        wording_score: score,
        wording_reason: typeof result.reason === "string" ? result.reason : null,
        suggested_wording: typeof result.suggestedWording === "string" && result.suggestedWording.trim() ? result.suggestedWording.trim() : null,
        themes,
        ai_model: model,
        analyzed_at: analyzedAt
      }).eq("id", item.id);
      if (updateError) throw new Error(updateError.message);
      return isCandidate;
    });
    const updateResults = await Promise.all(updates);
    analyzed += updateResults.filter((result) => result !== null).length;
    candidates += updateResults.filter((result) => result === true).length;
  }
  return { analyzed, candidates };
}

export async function syncMetaCommentsForClient(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const sources = await loadStorySources(clientId);
  const { data: states, error: stateError } = await supabase
    .from("meta_comment_sync_state")
    .select("object_story_id,last_synced_at")
    .eq("client_id", clientId);
  if (stateError) throw new Error(stateError.message);
  const sourceStoryIds = new Set(sources.map((source) => source.storyId));
  const staleStoryIds = ((states ?? []) as SyncStateRow[])
    .map((state) => state.object_story_id)
    .filter((storyId) => !sourceStoryIds.has(storyId));
  for (let offset = 0; offset < staleStoryIds.length; offset += 500) {
    const { error } = await supabase
      .from("meta_comment_sync_state")
      .delete()
      .eq("client_id", clientId)
      .in("object_story_id", staleStoryIds.slice(offset, offset + 500));
    if (error) throw new Error(error.message);
  }
  const stateByStory = new Map(((states ?? []) as SyncStateRow[]).map((state) => [state.object_story_id, state]));
  const sorted = sources.sort((left, right) => {
    const leftTime = stateByStory.get(left.storyId)?.last_synced_at ?? "";
    const rightTime = stateByStory.get(right.storyId)?.last_synced_at ?? "";
    return leftTime.localeCompare(rightTime);
  });
  const configuredLimit = Number(getOptionalEnv("META_COMMENTS_MAX_STORIES_PER_RUN", "1000"));
  const selected = sorted.slice(0, Math.max(1, Number.isFinite(configuredLimit) ? Math.floor(configuredLimit) : 1000));
  const pageTokens = new Map<string, string>();
  const pageTokenErrors = new Map<string, Error>();
  for (const pageId of new Set(selected.map((source) => source.pageId))) {
    try {
      pageTokens.set(pageId, await resolvePageAccessToken(pageId));
    } catch (error) {
      pageTokenErrors.set(pageId, error instanceof Error ? error : new Error("Page Access Token konnte nicht geladen werden."));
    }
  }
  const collectedRows: Array<JsonRecord & { meta_comment_id: string; comment_created_at: string | null }> = [];
  const stateRows: JsonRecord[] = [];
  let fetched = 0;
  let failedStories = 0;

  async function collect(source: StorySource, comments: MetaComment[], startedAt: string) {
    const rows = comments.filter((comment) => comment.id && comment.message?.trim()).map((comment) => ({
          client_id: clientId,
          ad_account_id: source.adAccountId,
          ad_id: source.adId,
          creative_id: source.creativeId,
          meta_comment_id: comment.id!,
          parent_meta_comment_id: comment.parent?.id ?? null,
          object_story_id: source.storyId,
          message: comment.message!.trim(),
          commenter_name: comment.from?.name ?? null,
          commenter_meta_id: comment.from?.id ?? null,
          like_count: Math.max(0, Number(comment.like_count) || 0),
          reply_count: Math.max(0, Number(comment.comment_count) || 0),
          comment_created_at: comment.created_time ?? null,
          raw: comment as unknown as JsonRecord
    }));
    fetched += rows.length;
    collectedRows.push(...rows);
    const latestComment = rows.map((row) => row.comment_created_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    stateRows.push({
          client_id: clientId,
          ad_account_id: source.adAccountId,
          ad_id: source.adId,
          creative_id: source.creativeId,
          object_story_id: source.storyId,
          status: "completed",
          last_synced_at: startedAt,
          last_comment_created_at: latestComment,
          error_message: null
    });
  }

  function collectFailure(source: StorySource, error: unknown) {
    failedStories += 1;
    stateRows.push({
          client_id: clientId,
          ad_account_id: source.adAccountId,
          ad_id: source.adId,
          creative_id: source.creativeId,
          object_story_id: source.storyId,
          status: "failed",
          error_message: error instanceof Error ? error.message.slice(0, 1000) : "Unbekannter Meta Fehler"
    });
  }

  for (const pageId of new Set(selected.map((source) => source.pageId))) {
    const pageSources = selected.filter((source) => source.pageId === pageId);
    const accessToken = pageTokens.get(pageId);
    const tokenError = pageTokenErrors.get(pageId);
    if (!accessToken) {
      for (const source of pageSources) collectFailure(source, tokenError ?? new Error("Page Access Token fehlt."));
      continue;
    }

    const chunks: Array<Array<{ source: StorySource; since: string | null }>> = [];
    for (let offset = 0; offset < pageSources.length; offset += 50) {
      chunks.push(pageSources.slice(offset, offset + 50).map((source) => ({
        source,
        since: stateByStory.get(source.storyId)?.last_synced_at ?? null
      })));
    }
    const concurrency = Math.max(1, Number(getOptionalEnv("META_COMMENTS_BATCH_CONCURRENCY", "4")) || 4);
    for (let offset = 0; offset < chunks.length; offset += concurrency) {
      await Promise.all(chunks.slice(offset, offset + concurrency).map(async (chunk) => {
        const startedAt = new Date().toISOString();
        try {
          const results = await fetchStoryCommentsBatch(chunk, accessToken);
          for (const result of results) await collect(result.source, result.comments, startedAt);
        } catch {
          const fallback = await Promise.allSettled(chunk.map(async (item) => ({ source: item.source, comments: await fetchStoryComments(item.source.storyId, item.since, accessToken) })));
          for (let index = 0; index < fallback.length; index += 1) {
            const result = fallback[index];
            if (result.status === "fulfilled") await collect(result.value.source, result.value.comments, startedAt);
            else collectFailure(chunk[index].source, result.reason);
          }
        }
      }));
    }
  }

  const uniqueRows = [...new Map(collectedRows.map((row) => [row.meta_comment_id, row])).values()];
  const existingIds = new Set<string>();
  for (let offset = 0; offset < uniqueRows.length; offset += 500) {
    const ids = uniqueRows.slice(offset, offset + 500).map((row) => row.meta_comment_id);
    const { data: existing, error } = await supabase.from("meta_comments").select("meta_comment_id").eq("client_id", clientId).in("meta_comment_id", ids);
    if (error) throw new Error(error.message);
    for (const row of existing ?? []) existingIds.add(row.meta_comment_id);
  }
  const inserted = uniqueRows.filter((row) => !existingIds.has(row.meta_comment_id)).length;
  for (let offset = 0; offset < uniqueRows.length; offset += 500) {
    const { error } = await supabase.from("meta_comments").upsert(uniqueRows.slice(offset, offset + 500), { onConflict: "client_id,meta_comment_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  for (let offset = 0; offset < stateRows.length; offset += 500) {
    const { error } = await supabase.from("meta_comment_sync_state").upsert(stateRows.slice(offset, offset + 500), { onConflict: "client_id,object_story_id" });
    if (error) throw new Error(error.message);
  }
  revalidateCacheTags(CACHE_TAGS.comments);
  let ai = { analyzed: 0, candidates: 0 };
  let aiError: string | null = null;
  try {
    ai = await analyzePendingComments(clientId);
  } catch (error) {
    aiError = error instanceof Error ? error.message : "AI Kommentaranalyse fehlgeschlagen.";
  }
  revalidateCacheTags(CACHE_TAGS.comments);
  return { stories: selected.length, availableStories: sources.length, fetched, inserted, failedStories, ...ai, aiError };
}

async function getMetaCommentsOverviewUncached(clientId: string): Promise<MetaCommentsOverview> {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: rows, error }, { data: states, error: syncError }] = await Promise.all([
    supabase.from("meta_comments").select("*").eq("client_id", clientId).order("is_wording_candidate", { ascending: false }).order("wording_score", { ascending: false, nullsFirst: false }).order("comment_created_at", { ascending: false }).limit(1000),
    supabase.from("meta_comment_sync_state").select("status,last_synced_at,error_message").eq("client_id", clientId)
  ]);
  if (error || syncError) return { comments: [], totals: { comments: 0, candidates: 0, analyzed: 0, pending: 0 }, sync: { stories: 0, failedStories: 0, lastSyncedAt: null, lastError: null }, error: error?.message ?? syncError?.message ?? null };

  const adIds = [...new Set((rows ?? []).map((row) => row.ad_id).filter(Boolean))];
  const creativeIds = [...new Set((rows ?? []).map((row) => row.creative_id).filter(Boolean))];
  const [{ data: ads }, { data: creatives }] = await Promise.all([
    adIds.length ? supabase.from("meta_ads").select("id,name").in("id", adIds) : Promise.resolve({ data: [] }),
    creativeIds.length ? supabase.from("creatives").select("id,name").in("id", creativeIds) : Promise.resolve({ data: [] })
  ]);
  const adNames = new Map((ads ?? []).map((item) => [item.id, item.name]));
  const creativeNames = new Map((creatives ?? []).map((item) => [item.id, item.name]));
  const comments = (rows ?? []).map((row): MetaCommentListItem => ({
    id: row.id,
    metaCommentId: row.meta_comment_id,
    message: row.message,
    commenterName: row.commenter_name,
    likeCount: Number(row.like_count ?? 0),
    replyCount: Number(row.reply_count ?? 0),
    commentCreatedAt: row.comment_created_at,
    aiStatus: row.ai_status,
    isWordingCandidate: row.is_wording_candidate,
    wordingScore: row.wording_score === null ? null : Number(row.wording_score),
    wordingReason: row.wording_reason,
    suggestedWording: row.suggested_wording,
    themes: Array.isArray(row.themes) ? row.themes : [],
    adId: row.ad_id,
    adName: row.ad_id ? adNames.get(row.ad_id) ?? null : null,
    creativeId: row.creative_id,
    creativeName: row.creative_id ? creativeNames.get(row.creative_id) ?? null : null
  }));
  const syncRows = states ?? [];
  return {
    comments,
    totals: {
      comments: comments.length,
      candidates: comments.filter((item) => item.isWordingCandidate).length,
      analyzed: comments.filter((item) => item.aiStatus === "analyzed").length,
      pending: comments.filter((item) => item.aiStatus === "pending").length
    },
    sync: {
      stories: syncRows.length,
      failedStories: syncRows.filter((item) => item.status === "failed").length,
      lastSyncedAt: syncRows.map((item) => item.last_synced_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
      lastError: syncRows.find((item) => item.status === "failed" && item.error_message)?.error_message ?? null
    },
    error: null
  };
}

const getMetaCommentsOverviewCached = unstable_cache(getMetaCommentsOverviewUncached, ["meta-comments-overview-v1"], { revalidate: 300, tags: [CACHE_TAGS.comments] });

export async function getMetaCommentsOverview(clientId: string) {
  return getMetaCommentsOverviewCached(clientId);
}
