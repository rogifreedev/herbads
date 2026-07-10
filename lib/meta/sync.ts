import "server-only";

import { META_DATA_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { normalizeMetaAccountStatus } from "@/lib/meta/daily-sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getOptionalEnv } from "@/lib/env";

type JsonRecord = Record<string, unknown>;

type MetaListResponse<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string };
};

type MetaAdAccount = {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
};

type MetaCampaign = JsonRecord & {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
};

type MetaAdSet = JsonRecord & {
  id: string;
  campaign_id?: string;
  name?: string;
  optimization_goal?: string;
  billing_event?: string;
  status?: string;
  effective_status?: string;
  promoted_object?: {
    product_set_id?: string;
    product_catalog_id?: string;
  };
};

type MetaAd = JsonRecord & {
  id: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: { id?: string };
  name?: string;
  status?: string;
  effective_status?: string;
};

type MetaCreative = JsonRecord & {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  call_to_action_type?: string;
  image_url?: string;
  image_hash?: string;
  thumbnail_url?: string;
  video_id?: string;
  object_url?: string;
  effective_object_story_id?: string;
  asset_feed_spec?: {
    bodies?: Array<{ text?: string }>;
    images?: Array<{ hash?: string }>;
    link_urls?: Array<{ display_url?: string; website_url?: string }>;
    titles?: Array<{ text?: string }>;
    videos?: Array<{ video_id?: string; thumbnail_url?: string }>;
    call_to_action_types?: string[];
    product_sets?: unknown[];
    product_set_id?: string;
  };
  object_story_spec?: {
    template_data?: unknown;
    product_data?: unknown;
    link_data?: {
      name?: string;
      message?: string;
      picture?: string;
      link?: string;
      call_to_action?: { type?: string; value?: { link?: string } };
    };
    video_data?: {
      title?: string;
      message?: string;
      video_id?: string;
      call_to_action?: { type?: string; value?: { link?: string } };
    };
  };
};

type MetaAction = {
  action_type?: string;
  value?: string;
};

type MetaInsight = JsonRecord & {
  date_start: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  country?: string;
  age?: string;
  gender?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  spend?: string;
  clicks?: string;
  inline_link_clicks?: string;
  outbound_clicks?: MetaAction[];
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
};

type MetaAdImage = {
  hash?: string;
  url?: string;
  permalink_url?: string;
  width?: number;
  height?: number;
};

type MetaVideo = {
  id: string;
  picture?: string;
  source?: string;
  permalink_url?: string;
  embed_html?: string;
  thumbnails?: {
    data?: Array<{
      uri?: string;
      is_preferred?: boolean;
      width?: number;
      height?: number;
    }>;
  };
};

const ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status";
const CAMPAIGN_FIELDS = "id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,buying_type";
const ADSET_FIELDS = "id,name,campaign_id,optimization_goal,billing_event,status,effective_status,targeting,promoted_object,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time";
const AD_FIELDS = "id,name,campaign_id,adset_id,creative{id},status,effective_status,created_time,updated_time";
const CREATIVE_FIELDS = "id,name,title,body,object_story_spec,asset_feed_spec,call_to_action_type,thumbnail_url,image_url,image_hash,video_id,object_url,url_tags,effective_object_story_id";
const INSIGHTS_FIELDS = "date_start,date_stop,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,reach,frequency,spend,clicks,inline_link_clicks,outbound_clicks,ctr,cpc,cpm,actions,action_values,video_thruplay_watched_actions";
const BREAKDOWN_INSIGHTS_FIELDS = "date_start,date_stop,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,reach,frequency,spend,clicks,inline_link_clicks,outbound_clicks,ctr,cpc,cpm,actions,action_values";
const ADIMAGE_FIELDS = "hash,url,permalink_url,width,height";
const VIDEO_FIELDS = "thumbnails{uri,is_preferred,width,height},picture,source,permalink_url,embed_html";
const PURCHASE_ACTION_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const ENGAGEMENT_ACTION_TYPES = ["post_engagement", "page_engagement", "post_reaction", "comment", "post", "like"];
const OUTBOUND_CLICK_ACTION_TYPES = ["outbound_click"];
const DEMOGRAPHIC_BREAKDOWNS = [
  { type: "country", field: "country" },
  { type: "age", field: "age" },
  { type: "gender", field: "gender" }
] as const;

type StoredAd = {
  id: string;
  meta_ad_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  creative_id: string | null;
};

type StoredAdMap = Map<string, StoredAd>;

type MetaSyncOptions = {
  since?: string | null;
  until?: string | null;
  includeBreakdowns?: boolean;
  jobType?: string;
  replaceExisting?: boolean;
};

type StoredInsightKey = {
  id: string;
  ad_id: string;
  date: string;
  breakdown_type?: string;
  breakdown_value?: string;
};

function getMetaToken() {
  const token = getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!token) throw new Error("META_SYSTEM_USER_ACCESS_TOKEN fehlt.");
  return token;
}

function getApiVersion() {
  return getOptionalEnv("META_API_VERSION", "v20.0");
}

async function fetchMeta<T>(pathOrUrl: string): Promise<T> {
  const token = getMetaToken();
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `https://graph.facebook.com/${getApiVersion()}/${pathOrUrl}${pathOrUrl.includes("?") ? "&" : "?"}access_token=${token}`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "Meta API Anfrage fehlgeschlagen.");
  }

  return payload as T;
}

async function fetchMetaList<T>(path: string) {
  const items: T[] = [];
  let nextUrl: string | null = path;

  while (nextUrl) {
    const payload: MetaListResponse<T> = await fetchMeta<MetaListResponse<T>>(nextUrl);
    items.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ?? null;
  }

  return items;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function insightKey(row: { ad_id: string; date: string }) {
  return `${row.ad_id}:${row.date}`;
}

function breakdownInsightKey(row: { ad_id: string; date: string; breakdown_type: string; breakdown_value: string }) {
  return `${row.ad_id}:${row.date}:${row.breakdown_type}:${row.breakdown_value}`;
}

async function removeStaleInsightRows(
  table: "creative_insights_daily" | "creative_insight_breakdowns_daily",
  adAccountId: string,
  range: { since: string; until: string },
  desiredKeys: Set<string>,
  breakdownType?: string
) {
  const supabase = createSupabaseServiceRoleClient();
  const storedRows: StoredInsightKey[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const result = table === "creative_insights_daily"
      ? await supabase
          .from("creative_insights_daily")
          .select("id,ad_id,date")
          .eq("ad_account_id", adAccountId)
          .gte("date", range.since)
          .lte("date", range.until)
          .range(from, from + pageSize - 1)
      : await supabase
          .from("creative_insight_breakdowns_daily")
          .select("id,ad_id,date,breakdown_type,breakdown_value")
          .eq("ad_account_id", adAccountId)
          .eq("breakdown_type", breakdownType ?? "")
          .gte("date", range.since)
          .lte("date", range.until)
          .range(from, from + pageSize - 1);

    const { data, error } = result;
    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as StoredInsightKey[];
    storedRows.push(...page);
    if (page.length < pageSize) break;
  }

  const staleIds = storedRows
    .filter((row) => {
      const key = breakdownType
        ? breakdownInsightKey({
            ad_id: row.ad_id,
            date: row.date,
            breakdown_type: row.breakdown_type ?? breakdownType,
            breakdown_value: row.breakdown_value ?? ""
          })
        : insightKey(row);
      return !desiredKeys.has(key);
    })
    .map((row) => row.id);

  for (const staleIdChunk of chunk(staleIds, 500)) {
    const { error } = await supabase.from(table).delete().in("id", staleIdChunk);
    if (error) throw new Error(error.message);
  }

  return staleIds.length;
}

function firstText(items: Array<{ text?: string }> | undefined) {
  return items?.find((item) => item.text)?.text ?? null;
}

function creativeTitle(creative: MetaCreative) {
  return creative.title ?? creative.object_story_spec?.link_data?.name ?? creative.object_story_spec?.video_data?.title ?? firstText(creative.asset_feed_spec?.titles);
}

function creativeBody(creative: MetaCreative) {
  return creative.body ?? creative.object_story_spec?.link_data?.message ?? creative.object_story_spec?.video_data?.message ?? firstText(creative.asset_feed_spec?.bodies);
}

function creativeCta(creative: MetaCreative) {
  return (
    creative.call_to_action_type ??
    creative.object_story_spec?.link_data?.call_to_action?.type ??
    creative.object_story_spec?.video_data?.call_to_action?.type ??
    creative.asset_feed_spec?.call_to_action_types?.[0] ??
    null
  );
}

function creativeImageUrl(creative: MetaCreative) {
  return creative.image_url ?? creative.object_story_spec?.link_data?.picture ?? null;
}

function creativeVideoId(creative: MetaCreative) {
  return creative.video_id ?? creative.object_story_spec?.video_data?.video_id ?? creative.asset_feed_spec?.videos?.[0]?.video_id ?? null;
}

function creativeLandingUrl(creative: MetaCreative) {
  return (
    creative.object_url ??
    creative.object_story_spec?.link_data?.call_to_action?.value?.link ??
    creative.object_story_spec?.video_data?.call_to_action?.value?.link ??
    creative.object_story_spec?.link_data?.link ??
    creative.asset_feed_spec?.link_urls?.find((link) => link.website_url)?.website_url ??
    null
  );
}

function isCatalogCreative(creative: MetaCreative) {
  const serializedName = `${creative.name ?? ""} ${creative.title ?? ""} ${creative.body ?? ""}`.toLowerCase();

  return Boolean(
    creative.object_story_spec?.template_data ||
      creative.object_story_spec?.product_data ||
      creative.asset_feed_spec?.product_set_id ||
      creative.asset_feed_spec?.product_sets?.length ||
      serializedName.includes("{{product.")
  );
}

function creativeType(creative: MetaCreative, isCatalog = false) {
  if (isCatalog || isCatalogCreative(creative)) return "catalog";
  if (creativeVideoId(creative)) return "video";
  if (creativeImageUrl(creative) || extractImageHashes(creative).length > 0) return "image";
  if (creative.effective_object_story_id && creative.thumbnail_url) return "post";
  return "unknown";
}

function extractImageHashes(creative: MetaCreative) {
  return Array.from(
    new Set([
      creative.image_hash,
      ...(creative.asset_feed_spec?.images ?? []).map((image) => image.hash)
    ].filter(Boolean) as string[])
  );
}

function bestVideoThumbnail(video: MetaVideo) {
  const thumbnails = video.thumbnails?.data ?? [];
  const preferred = thumbnails.find((thumbnail) => thumbnail.is_preferred && thumbnail.uri);
  const largest = [...thumbnails]
    .filter((thumbnail) => thumbnail.uri)
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];

  return preferred?.uri ?? largest?.uri ?? video.picture ?? null;
}

function absoluteFacebookUrl(value: string | undefined) {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  if (value.startsWith("/")) return `https://www.facebook.com${value}`;
  return value;
}

function extractIframeSrc(embedHtml: string | undefined) {
  if (!embedHtml) return null;
  const match = embedHtml.match(/src="([^"]+)"/);
  return match?.[1] ?? null;
}

async function fetchAdImageUrlMap(adAccountId: string, creatives: MetaCreative[]) {
  const hashes = Array.from(new Set(creatives.flatMap(extractImageHashes)));
  const imageMap = new Map<string, string>();

  for (const hashChunk of chunk(hashes, 10)) {
    if (hashChunk.length === 0) continue;
    const encodedHashes = encodeURIComponent(JSON.stringify(hashChunk));
    const payload = await fetchMeta<MetaListResponse<MetaAdImage>>(`${adAccountId}/adimages?hashes=${encodedHashes}&fields=${ADIMAGE_FIELDS}`);

    for (const image of payload.data ?? []) {
      if (!image.hash) continue;
      imageMap.set(image.hash, image.url ?? image.permalink_url ?? "");
    }
  }

  return imageMap;
}

async function fetchVideoAssetMap(creatives: MetaCreative[]) {
  const videoIds = Array.from(new Set(creatives.map(creativeVideoId).filter(Boolean))) as string[];
  const assetMap = new Map<string, { thumbnailUrl: string | null; videoUrl: string | null; embedUrl: string | null; permalinkUrl: string | null }>();

  for (const videoIdChunk of chunk(videoIds, 50)) {
    if (videoIdChunk.length === 0) continue;
    const payload = await fetchMeta<Record<string, MetaVideo>>(`?ids=${videoIdChunk.join(",")}&fields=${VIDEO_FIELDS}`);

    for (const [videoId, video] of Object.entries(payload)) {
      assetMap.set(videoId, {
        thumbnailUrl: bestVideoThumbnail(video),
        videoUrl: video.source ?? null,
        embedUrl: extractIframeSrc(video.embed_html),
        permalinkUrl: absoluteFacebookUrl(video.permalink_url)
      });
    }
  }

  return assetMap;
}

function bestImageUrl(creative: MetaCreative, imageMap: Map<string, string>) {
  const firstHashUrl = extractImageHashes(creative).map((hash) => imageMap.get(hash)).find(Boolean);
  return firstHashUrl ?? creativeImageUrl(creative);
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInteger(value: unknown) {
  return Math.round(toNumber(value));
}

function findActionValue(actions: MetaAction[] | undefined, actionTypes: string[]) {
  for (const actionType of actionTypes) {
    const action = actions?.find((item) => item.action_type === actionType);
    const value = toNumber(action?.value);
    if (value > 0) return value;
  }

  return 0;
}

function sumActionValue(actions: MetaAction[] | undefined, actionTypes: string[]) {
  return (actions ?? []).reduce((sum, action) => {
    if (!action.action_type || !actionTypes.includes(action.action_type)) return sum;
    return sum + toNumber(action.value);
  }, 0);
}

function mapInsightRow(clientId: string, adAccountId: string, adIdMap: StoredAdMap, insight: MetaInsight) {
  if (!insight.ad_id) return null;
  const storedAd = adIdMap.get(insight.ad_id);
  if (!storedAd?.id) return null;

  const spend = toNumber(insight.spend);
  const purchases = findActionValue(insight.actions, PURCHASE_ACTION_TYPES);
  const purchaseValue = findActionValue(insight.action_values, PURCHASE_ACTION_TYPES);
  const impressions = toInteger(insight.impressions);
  const clicks = toInteger(insight.clicks);

  return {
    client_id: clientId,
    ad_account_id: adAccountId,
    campaign_id: storedAd.campaign_id ?? null,
    adset_id: storedAd.adset_id ?? null,
    ad_id: storedAd.id,
    creative_id: storedAd.creative_id ?? null,
    date: insight.date_start,
    spend,
    impressions,
    reach: toInteger(insight.reach),
    frequency: insight.frequency ? toNumber(insight.frequency) : null,
    clicks,
    link_clicks: toInteger(insight.inline_link_clicks),
    outbound_clicks: toInteger(findActionValue(insight.outbound_clicks, OUTBOUND_CLICK_ACTION_TYPES)),
    ctr: insight.ctr ? toNumber(insight.ctr) : null,
    cpc: insight.cpc ? toNumber(insight.cpc) : null,
    cpm: insight.cpm ? toNumber(insight.cpm) : null,
    purchases,
    purchase_value: purchaseValue,
    cost_per_purchase: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 ? purchaseValue / spend : null,
    engagement: toInteger(sumActionValue(insight.actions, ENGAGEMENT_ACTION_TYPES)),
    video_3s_views: toInteger(findActionValue(insight.actions, ["video_view"])),
    thruplays: toInteger(findActionValue(insight.video_thruplay_watched_actions, ["video_view"])),
    raw: insight
  };
}

function mapBreakdownInsightRow(
  clientId: string,
  adAccountId: string,
  adIdMap: StoredAdMap,
  insight: MetaInsight,
  breakdown: (typeof DEMOGRAPHIC_BREAKDOWNS)[number]
) {
  const baseRow = mapInsightRow(clientId, adAccountId, adIdMap, insight);
  const breakdownValue = insight[breakdown.field];
  if (!baseRow || !breakdownValue) return null;

  return {
    ...baseRow,
    breakdown_type: breakdown.type,
    breakdown_value: String(breakdownValue)
  };
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function splitDateRange(range: { since: string; until: string }) {
  const configuredDays = Number(getOptionalEnv("META_SYNC_INSIGHT_CHUNK_DAYS", "30"));
  const chunkDays = Math.max(1, Math.floor(Number.isFinite(configuredDays) ? configuredDays : 30));
  const ranges: Array<{ since: string; until: string }> = [];
  let since = range.since;

  while (since <= range.until) {
    const chunkUntil = addDays(since, chunkDays - 1);
    const until = chunkUntil < range.until ? chunkUntil : range.until;
    ranges.push({ since, until });
    since = addDays(until, 1);
  }

  return ranges;
}

function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function resolveInsightDateRange(input?: { since?: string | null; until?: string | null }) {
  const sinceInput = input?.since?.trim() || null;
  const untilInput = input?.until?.trim() || null;
  const lookbackDays = Number(getOptionalEnv("META_SYNC_LOOKBACK_DAYS", "7"));
  const since = sinceInput ?? dateDaysAgo(Number.isFinite(lookbackDays) ? lookbackDays : 7);
  const until = untilInput ?? today();

  if (!isDateString(since)) throw new Error("Sync Startdatum muss im Format YYYY-MM-DD sein.");
  if (!isDateString(until)) throw new Error("Sync Enddatum muss im Format YYYY-MM-DD sein.");
  if (since > until) throw new Error("Sync Startdatum darf nicht nach dem Enddatum liegen.");

  return { since, until };
}

async function syncMetaDemographicBreakdowns(
  clientId: string,
  adAccountId: string,
  metaAccountId: string,
  adIdMap: StoredAdMap,
  insightRanges: Array<{ since: string; until: string }>,
  replaceExisting: boolean
) {
  const supabase = createSupabaseServiceRoleClient();
  const errors: Array<{ breakdown: string; since: string; until: string; error: string }> = [];
  let rowCount = 0;

  for (const range of insightRanges) {
    const timeRange = encodeURIComponent(JSON.stringify(range));

    for (const breakdown of DEMOGRAPHIC_BREAKDOWNS) {
      try {
        const insights = await fetchMetaList<MetaInsight>(
          `${metaAccountId}/insights?level=ad&time_increment=1&use_account_attribution_setting=true&time_range=${timeRange}&breakdowns=${breakdown.field}&fields=${BREAKDOWN_INSIGHTS_FIELDS}&limit=100`
        );
        const breakdownRows = insights
          .map((insight) => mapBreakdownInsightRow(clientId, adAccountId, adIdMap, insight, breakdown))
          .filter((row): row is NonNullable<typeof row> => Boolean(row));

        for (const breakdownChunk of chunk(breakdownRows, 500)) {
          const { error } = await supabase.from("creative_insight_breakdowns_daily").upsert(breakdownChunk, { onConflict: "ad_id,date,breakdown_type,breakdown_value" });
          if (error) throw new Error(error.message);
        }

        if (replaceExisting) {
          const desiredKeys = new Set(breakdownRows.map((row) => breakdownInsightKey(row)));
          await removeStaleInsightRows(
            "creative_insight_breakdowns_daily",
            adAccountId,
            range,
            desiredKeys,
            breakdown.type
          );
        }

        rowCount += breakdownRows.length;
      } catch (error) {
        errors.push({
          breakdown: breakdown.type,
          since: range.since,
          until: range.until,
          error: error instanceof Error ? error.message : "Meta Breakdown Sync fehlgeschlagen."
        });
      }
    }
  }

  return { rowCount, errorCount: errors.length, errors: errors.slice(0, 10) };
}

export async function syncMetaForClient(clientId: string, options?: MetaSyncOptions) {
  const supabase = createSupabaseServiceRoleClient();
  const insightDateRange = resolveInsightDateRange(options);
  const includeBreakdowns = options?.includeBreakdowns !== false;
  const replaceExisting = options?.replaceExisting !== false;
  const { data: account, error: accountError } = await supabase
    .from("meta_ad_accounts")
    .select("id,client_id,meta_account_id")
    .eq("client_id", clientId)
    .limit(1)
    .single();

  if (accountError || !account) {
    throw new Error(accountError?.message ?? "Kein Meta Ad Account fuer diesen Kunden gefunden.");
  }

  const { data: job } = await supabase
    .from("sync_jobs")
    .insert({
      client_id: clientId,
      ad_account_id: account.id,
      job_type: options?.jobType ?? "manual_meta_sync",
      status: "running",
      payload: { insightDateRange, includeBreakdowns, replaceExisting },
      started_at: new Date().toISOString()
    })
    .select("id")
    .single();

  try {
    const metaAccount = await fetchMeta<MetaAdAccount>(`${account.meta_account_id}?fields=${ACCOUNT_FIELDS}`);
    await supabase
      .from("meta_ad_accounts")
      .update({
        name: metaAccount.name ?? null,
        currency: metaAccount.currency ?? null,
        timezone_name: metaAccount.timezone_name ?? null,
        status: normalizeMetaAccountStatus(metaAccount.account_status)
      })
      .eq("id", account.id);

    const campaigns = await fetchMetaList<MetaCampaign>(`${account.meta_account_id}/campaigns?fields=${CAMPAIGN_FIELDS}&limit=100`);
    if (campaigns.length > 0) {
      await supabase.from("meta_campaigns").upsert(
        campaigns.map((campaign) => ({
          client_id: clientId,
          ad_account_id: account.id,
          meta_campaign_id: campaign.id,
          name: campaign.name ?? null,
          objective: campaign.objective ?? null,
          status: campaign.status ?? null,
          effective_status: campaign.effective_status ?? null,
          raw: campaign
        })),
        { onConflict: "ad_account_id,meta_campaign_id" }
      );
    }

    const { data: storedCampaigns } = await supabase.from("meta_campaigns").select("id,meta_campaign_id").eq("ad_account_id", account.id);
    const campaignIdMap = new Map((storedCampaigns ?? []).map((campaign) => [campaign.meta_campaign_id, campaign.id]));

    const adSets = await fetchMetaList<MetaAdSet>(`${account.meta_account_id}/adsets?fields=${ADSET_FIELDS}&limit=100`);
    if (adSets.length > 0) {
      await supabase.from("meta_ad_sets").upsert(
        adSets.map((adSet) => ({
          client_id: clientId,
          ad_account_id: account.id,
          campaign_id: adSet.campaign_id ? campaignIdMap.get(adSet.campaign_id) ?? null : null,
          meta_adset_id: adSet.id,
          name: adSet.name ?? null,
          optimization_goal: adSet.optimization_goal ?? null,
          billing_event: adSet.billing_event ?? null,
          status: adSet.status ?? null,
          effective_status: adSet.effective_status ?? null,
          raw: adSet
        })),
        { onConflict: "ad_account_id,meta_adset_id" }
      );
    }

    const { data: storedAdSets } = await supabase.from("meta_ad_sets").select("id,meta_adset_id").eq("ad_account_id", account.id);
    const adSetIdMap = new Map((storedAdSets ?? []).map((adSet) => [adSet.meta_adset_id, adSet.id]));

    const ads = await fetchMetaList<MetaAd>(`${account.meta_account_id}/ads?fields=${AD_FIELDS}&limit=100`);
    const creativeIds = Array.from(new Set(ads.map((ad) => ad.creative?.id).filter(Boolean))) as string[];
    const catalogAdSetIds = new Set(
      adSets
        .filter((adSet) => adSet.promoted_object?.product_set_id || adSet.promoted_object?.product_catalog_id)
        .map((adSet) => adSet.id)
    );
    const catalogCreativeIds = new Set(
      ads
        .filter((ad) => ad.adset_id && catalogAdSetIds.has(ad.adset_id) && ad.creative?.id)
        .map((ad) => ad.creative?.id as string)
    );
    const creatives: MetaCreative[] = [];

    for (const creativeIdChunk of chunk(creativeIds, 50)) {
      const payload = await fetchMeta<Record<string, MetaCreative>>(`?ids=${creativeIdChunk.join(",")}&fields=${CREATIVE_FIELDS}`);
      creatives.push(...Object.values(payload));
    }

    const [adImageUrlMap, videoAssetMap] = await Promise.all([
      fetchAdImageUrlMap(account.meta_account_id, creatives),
      fetchVideoAssetMap(creatives)
    ]);

    if (creatives.length > 0) {
      await supabase.from("creatives").upsert(
        creatives.map((creative) => {
          const videoId = creativeVideoId(creative);
          const imageUrl = bestImageUrl(creative, adImageUrlMap);
          const videoAsset = videoId ? videoAssetMap.get(videoId) : null;

          return {
            client_id: clientId,
            ad_account_id: account.id,
            meta_creative_id: creative.id,
            creative_type: creativeType(creative, catalogCreativeIds.has(creative.id)),
            name: creative.name ?? null,
            title: creativeTitle(creative),
            body: creativeBody(creative),
            call_to_action_type: creativeCta(creative),
            image_url: imageUrl,
            video_id: videoId,
            video_url: videoAsset?.videoUrl ?? null,
            video_embed_url: videoAsset?.embedUrl ?? null,
            video_permalink_url: videoAsset?.permalinkUrl ?? null,
            thumbnail_url: videoAsset?.thumbnailUrl ?? imageUrl ?? creative.thumbnail_url ?? null,
            landing_url: creativeLandingUrl(creative),
            raw: creative
          };
        }),
        { onConflict: "ad_account_id,meta_creative_id" }
      );
    }

    const { data: storedCreatives } = await supabase.from("creatives").select("id,meta_creative_id").eq("ad_account_id", account.id);
    const creativeIdMap = new Map((storedCreatives ?? []).map((creative) => [creative.meta_creative_id, creative.id]));

    if (ads.length > 0) {
      await supabase.from("meta_ads").upsert(
        ads.map((ad) => ({
          client_id: clientId,
          ad_account_id: account.id,
          campaign_id: ad.campaign_id ? campaignIdMap.get(ad.campaign_id) ?? null : null,
          adset_id: ad.adset_id ? adSetIdMap.get(ad.adset_id) ?? null : null,
          creative_id: ad.creative?.id ? creativeIdMap.get(ad.creative.id) ?? null : null,
          meta_ad_id: ad.id,
          meta_creative_id: ad.creative?.id ?? null,
          name: ad.name ?? null,
          status: ad.status ?? null,
          effective_status: ad.effective_status ?? null,
          raw: ad
        })),
        { onConflict: "ad_account_id,meta_ad_id" }
      );
    }

    const { data: storedAds } = await supabase
      .from("meta_ads")
      .select("id,meta_ad_id,campaign_id,adset_id,creative_id")
      .eq("ad_account_id", account.id);
    const adIdMap: StoredAdMap = new Map(((storedAds ?? []) as StoredAd[]).map((ad) => [ad.meta_ad_id, ad]));

    let insightRowCount = 0;
    const insightRanges = splitDateRange(insightDateRange);
    for (const range of insightRanges) {
      const timeRange = encodeURIComponent(JSON.stringify(range));
      const insights = await fetchMetaList<MetaInsight>(
        `${account.meta_account_id}/insights?level=ad&time_increment=1&use_account_attribution_setting=true&time_range=${timeRange}&fields=${INSIGHTS_FIELDS}&limit=100`
      );
      const insightRows = insights.map((insight) => mapInsightRow(clientId, account.id, adIdMap, insight)).filter((row): row is NonNullable<typeof row> => Boolean(row));

      for (const insightChunk of chunk(insightRows, 500)) {
        const { error } = await supabase.from("creative_insights_daily").upsert(insightChunk, { onConflict: "ad_id,date" });
        if (error) throw new Error(error.message);
      }

      if (replaceExisting) {
        await removeStaleInsightRows(
          "creative_insights_daily",
          account.id,
          range,
          new Set(insightRows.map((row) => insightKey(row)))
        );
      }

      insightRowCount += insightRows.length;
    }

    const breakdownSummary = includeBreakdowns
      ? await syncMetaDemographicBreakdowns(
          clientId,
          account.id,
          account.meta_account_id,
          adIdMap,
          insightRanges,
          replaceExisting
        )
      : { rowCount: 0, errorCount: 0, errors: [] };

    const summary = {
      campaigns: campaigns.length,
      adSets: adSets.length,
      ads: ads.length,
      creatives: creatives.length,
      insights: insightRowCount,
      breakdownInsights: breakdownSummary.rowCount,
      breakdownErrorCount: breakdownSummary.errorCount,
      breakdownErrors: breakdownSummary.errors,
      breakdownsSkipped: !includeBreakdowns,
      since: insightDateRange.since,
      until: insightDateRange.until,
      insightRanges: insightRanges.length
    };

    if (job?.id) {
      await supabase.from("sync_jobs").update({ status: "completed", payload: summary, finished_at: new Date().toISOString() }).eq("id", job.id);
    }

    await supabase.from("meta_ad_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", account.id);

    revalidateCacheTags(...META_DATA_CACHE_TAGS);
    return summary;
  } catch (error) {
    if (job?.id) {
      await supabase
        .from("sync_jobs")
        .update({ status: "failed", error_message: error instanceof Error ? error.message : "Meta Sync fehlgeschlagen", finished_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    throw error;
  }
}

export async function syncMetaInsightsForClient(clientId: string, options?: MetaSyncOptions) {
  const supabase = createSupabaseServiceRoleClient();
  const insightDateRange = resolveInsightDateRange(options);
  const includeBreakdowns = options?.includeBreakdowns !== false;
  const replaceExisting = options?.replaceExisting !== false;
  const { data: account, error: accountError } = await supabase
    .from("meta_ad_accounts")
    .select("id,client_id,meta_account_id")
    .eq("client_id", clientId)
    .limit(1)
    .single();

  if (accountError || !account) {
    throw new Error(accountError?.message ?? "Kein Meta Ad Account fuer diesen Kunden gefunden.");
  }

  const { data: job } = await supabase
    .from("sync_jobs")
    .insert({
      client_id: clientId,
      ad_account_id: account.id,
      job_type: options?.jobType ?? "manual_meta_insights_sync",
      status: "running",
      payload: { insightDateRange, insightsOnly: true, includeBreakdowns, replaceExisting },
      started_at: new Date().toISOString()
    })
    .select("id")
    .single();

  try {
    const { data: storedAds } = await supabase
      .from("meta_ads")
      .select("id,meta_ad_id,campaign_id,adset_id,creative_id")
      .eq("ad_account_id", account.id);
    const adIdMap: StoredAdMap = new Map(((storedAds ?? []) as StoredAd[]).map((ad) => [ad.meta_ad_id, ad]));

    if (adIdMap.size === 0) {
      throw new Error("Keine gespeicherten Meta Ads gefunden. Bitte zuerst einen vollstaendigen Meta Sync ausfuehren.");
    }

    let insightRowCount = 0;
    const insightRanges = splitDateRange(insightDateRange);
    for (const range of insightRanges) {
      const timeRange = encodeURIComponent(JSON.stringify(range));
      const insights = await fetchMetaList<MetaInsight>(
        `${account.meta_account_id}/insights?level=ad&time_increment=1&use_account_attribution_setting=true&time_range=${timeRange}&fields=${INSIGHTS_FIELDS}&limit=100`
      );
      const insightRows = insights.map((insight) => mapInsightRow(clientId, account.id, adIdMap, insight)).filter((row): row is NonNullable<typeof row> => Boolean(row));

      for (const insightChunk of chunk(insightRows, 500)) {
        const { error } = await supabase.from("creative_insights_daily").upsert(insightChunk, { onConflict: "ad_id,date" });
        if (error) throw new Error(error.message);
      }

      if (replaceExisting) {
        await removeStaleInsightRows(
          "creative_insights_daily",
          account.id,
          range,
          new Set(insightRows.map((row) => insightKey(row)))
        );
      }

      insightRowCount += insightRows.length;
    }

    const breakdownSummary = includeBreakdowns
      ? await syncMetaDemographicBreakdowns(
          clientId,
          account.id,
          account.meta_account_id,
          adIdMap,
          insightRanges,
          replaceExisting
        )
      : { rowCount: 0, errorCount: 0, errors: [] };

    const summary = {
      campaigns: 0,
      adSets: 0,
      ads: adIdMap.size,
      creatives: 0,
      insights: insightRowCount,
      breakdownInsights: breakdownSummary.rowCount,
      breakdownErrorCount: breakdownSummary.errorCount,
      breakdownErrors: breakdownSummary.errors,
      breakdownsSkipped: !includeBreakdowns,
      since: insightDateRange.since,
      until: insightDateRange.until,
      insightRanges: insightRanges.length,
      insightsOnly: true
    };

    if (job?.id) {
      await supabase.from("sync_jobs").update({ status: "completed", payload: summary, finished_at: new Date().toISOString() }).eq("id", job.id);
    }

    await supabase.from("meta_ad_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", account.id);

    revalidateCacheTags(...META_DATA_CACHE_TAGS);
    return summary;
  } catch (error) {
    if (job?.id) {
      await supabase
        .from("sync_jobs")
        .update({ status: "failed", error_message: error instanceof Error ? error.message : "Meta Insights Sync fehlgeschlagen", finished_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    throw error;
  }
}
