import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { listBatchMedia } from "@/lib/batch-launch-drive";
import {
  batchAdsetName,
  buildAdSetPayload,
  validateCopy,
  validateGroups,
  validatePreset,
  budgetMinorUnits,
  validateLaunchActivation
} from "@/lib/batch-launch-plan";
import {
  BATCH_CAMPAIGN_FIELDS,
  BATCH_TEMPLATE_FIELDS,
  getLiveBatchOptions,
  mapBatchCampaign,
  metaLaunchRequest
} from "@/lib/meta/batch-launch";
import type {
  BatchCopySuggestion,
  BatchLaunchAccountContext,
  BatchLaunchMedia,
  BatchLaunchInput,
  BatchLaunchJob,
  BatchLaunchPreset,
  BatchLaunchState,
  BatchMediaFile,
  BatchCampaign
} from "@/lib/batch-launch-types";

export type BatchLaunchPayload = {
  input: BatchLaunchInput;
  files: BatchMediaFile[];
  metaAccountId: string;
  campaign: BatchCampaign;
  adsetPayload: Record<string, unknown>;
};

export type BatchLaunchJobRow = {
  id: string;
  client_id: string;
  ad_account_id: string;
  drive_folder_id: string;
  meta_campaign_id: string;
  name: string;
  status: BatchLaunchJob["status"];
  payload: BatchLaunchPayload;
  state: BatchLaunchState;
  error: string | null;
  updated_at: string;
  lease_token: string | null;
  lease_until: string | null;
};

export function mapLaunchJob(row: BatchLaunchJobRow): BatchLaunchJob {
  return {
    activate: Boolean(row.payload.input.activate),
    id: row.id,
    accountId: row.ad_account_id,
    metaAccountId: row.payload.metaAccountId,
    folderId: row.drive_folder_id,
    campaignId: row.meta_campaign_id,
    name: row.name,
    status: row.status,
    state: row.state,
    error: row.error,
    adCount: row.payload.input.groups.length,
    fileCount: row.payload.files.length,
    updatedAt: row.updated_at
  };
}

export async function launchAccount(clientId: string, accountId: string) {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from("meta_ad_accounts")
    .select("id,client_id,meta_account_id,name,currency")
    .eq("client_id", clientId)
    .eq("id", accountId)
    .single();
  if (error || !data) throw new Error("Werbekonto gehoert nicht zu diesem Partner.");
  return data as { id: string; client_id: string; meta_account_id: string; name: string; currency: string };
}

async function launchFolder(clientId: string, folderId: string) {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from("batch_folder_checks")
    .select("drive_folder_id,name")
    .eq("client_id", clientId)
    .eq("drive_folder_id", folderId)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("Batch-Ordner nicht gefunden. Bitte zuerst den Batch-Check ausfuehren.");
  return { id: data.drive_folder_id as string, name: data.name as string };
}

export async function getLaunchPresets(clientId: string, accountId: string): Promise<BatchLaunchPreset[]> {
  await launchAccount(clientId, accountId);
  return readLaunchPresets(accountId);
}

async function readLaunchPresets(accountId: string): Promise<BatchLaunchPreset[]> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from("batch_launch_presets")
    .select("id,name,settings")
    .eq("ad_account_id", accountId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, ...row.settings }));
}

export async function saveLaunchPreset(clientId: string, accountId: string, input: BatchLaunchPreset) {
  const account = await launchAccount(clientId, accountId);
  validatePreset(input);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 100)
    throw new Error("Vorlagenname fehlt oder ist zu lang.");
  if (input.dailyBudget) budgetMinorUnits(input.dailyBudget, account.currency);
  const db = createSupabaseServiceRoleClient();
  const row = {
    name: input.name.trim(),
    settings: { dailyBudget: input.dailyBudget, countries: [...new Set(input.countries)], locales: input.locales }
  };
  const query = input.id
    ? db.from("batch_launch_presets").update(row).eq("id", input.id).eq("ad_account_id", accountId)
    : db.from("batch_launch_presets").insert({ ...row, ad_account_id: accountId });
  const { error } = await query.select("id").single();
  if (error) throw new Error(error.message);
  return getLaunchPresets(clientId, accountId);
}

export async function deleteLaunchPreset(clientId: string, accountId: string, id: string) {
  await launchAccount(clientId, accountId);
  const { error } = await createSupabaseServiceRoleClient()
    .from("batch_launch_presets")
    .delete()
    .eq("ad_account_id", accountId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  return getLaunchPresets(clientId, accountId);
}

export async function getTemplateFavorites(clientId: string, accountId: string): Promise<string[]> {
  await launchAccount(clientId, accountId);
  return readTemplateFavorites(accountId);
}

async function readTemplateFavorites(accountId: string): Promise<string[]> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from("batch_adset_favorites")
    .select("meta_adset_id")
    .eq("ad_account_id", accountId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.meta_adset_id);
}

export async function setTemplateFavorite(clientId: string, accountId: string, templateId: string, favorite: boolean) {
  if (typeof templateId !== "string" || !/^\d{1,40}$/.test(templateId) || typeof favorite !== "boolean")
    throw new Error("Ungueltiger Adset-Favorit.");
  const account = await launchAccount(clientId, accountId);
  const db = createSupabaseServiceRoleClient();
  if (favorite) {
    if (process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()) {
      const source = await metaLaunchRequest<{ account_id: string; status: string }>(
        `${templateId}?fields=account_id,status`
      );
      if (
        String(source.account_id) !== account.meta_account_id.replace(/^act_/, "") ||
        !["ACTIVE", "PAUSED"].includes(source.status)
      )
        throw new Error("Adset ist fuer dieses Werbekonto nicht verfuegbar.");
    } else {
      const { data, error } = await db
        .from("meta_ad_sets")
        .select("id")
        .eq("ad_account_id", accountId)
        .eq("meta_adset_id", templateId)
        .in("status", ["ACTIVE", "PAUSED"])
        .maybeSingle();
      if (error || !data) throw new Error("Adset ist fuer dieses Werbekonto nicht verfuegbar.");
    }
    const { error } = await db
      .from("batch_adset_favorites")
      .upsert(
        { ad_account_id: accountId, meta_adset_id: templateId },
        { onConflict: "ad_account_id,meta_adset_id", ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("batch_adset_favorites")
      .delete()
      .eq("ad_account_id", accountId)
      .eq("meta_adset_id", templateId);
    if (error) throw new Error(error.message);
  }
  return getTemplateFavorites(clientId, accountId);
}

async function copySuggestions(accountId: string): Promise<BatchCopySuggestion[]> {
  const db = createSupabaseServiceRoleClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: stats, error } = await db.rpc("get_batch_launch_copy_stats", {
    p_ad_account_id: accountId,
    p_since: since
  });
  if (error) throw new Error(error.message);
  if (!stats?.length) return [];
  const { data: creatives, error: creativeError } = await db
    .from("creatives")
    .select("id,body,title,landing_url,call_to_action_type,raw")
    .eq("ad_account_id", accountId)
    .in(
      "id",
      stats.map((row: { creative_id: string }) => row.creative_id)
    );
  if (creativeError) throw new Error(creativeError.message);
  const suggestions = new Map<string, BatchCopySuggestion>();
  for (const stat of stats) {
    const creative = creatives?.find((row) => row.id === stat.creative_id);
    if (!creative) continue;
    const raw = creative.raw ?? {};
    const story = raw.object_story_spec ?? {};
    const texts = new Set<string>(
      (raw.asset_feed_spec?.bodies ?? []).map((body: { text: string }) => body.text).filter(Boolean)
    );
    if (creative.body) texts.add(creative.body);
    for (const text of texts) {
      const key = text.trim();
      if (!key) continue;
      const previous = suggestions.get(key);
      suggestions.set(key, {
        id: previous?.id ?? `${creative.id}-${suggestions.size}`,
        primaryText: key,
        headline: creative.title ?? "",
        description:
          story.link_data?.description ??
          story.video_data?.link_description ??
          raw.asset_feed_spec?.descriptions?.[0]?.text ??
          "",
        landingUrl: creative.landing_url ?? "",
        callToAction: creative.call_to_action_type ?? "SHOP_NOW",
        pageId: story.page_id ?? raw.effective_object_story_id?.split("_")[0] ?? "",
        instagramId: story.instagram_user_id ?? story.instagram_actor_id ?? "",
        urlTags: raw.url_tags ?? "",
        spend: (previous?.spend ?? 0) + Number(stat.spend),
        purchases: (previous?.purchases ?? 0) + Number(stat.purchases),
        revenue: (previous?.revenue ?? 0) + Number(stat.revenue),
        adCount: (previous?.adCount ?? 0) + Number(stat.ad_count)
      });
    }
  }
  return [...suggestions.values()].sort((a, b) => b.purchases - a.purchases || b.spend - a.spend).slice(0, 10);
}

export async function getBatchLaunchContext(
  clientId: string,
  folderId: string,
  requestedAccountId?: string
): Promise<BatchLaunchAccountContext> {
  const db = createSupabaseServiceRoleClient();
  const [folder, accountResult] = await Promise.all([
    launchFolder(clientId, folderId),
    db.from("meta_ad_accounts").select("id,meta_account_id,name,currency").eq("client_id", clientId).order("name")
  ]);
  if (accountResult.error) throw new Error(accountResult.error.message);
  const accounts = (accountResult.data ?? []).map((row) => ({
    id: row.id,
    metaAccountId: row.meta_account_id,
    name: row.name ?? row.meta_account_id,
    currency: row.currency ?? "EUR"
  }));
  const account = accounts.find((item) => item.id === (requestedAccountId || accounts[0]?.id));
  if (!account) throw new Error("Kein passendes Werbekonto gefunden.");
  // The account is already scoped to this client. Keep Drive and live Meta off the initial render path.
  const [presets, suggestions, jobs, favoriteTemplateIds, options] = await Promise.all([
    readLaunchPresets(account.id),
    copySuggestions(account.id),
    db
      .from("batch_launch_jobs")
      .select("*")
      .eq("client_id", clientId)
      .eq("ad_account_id", account.id)
      .eq("drive_folder_id", folderId)
      .order("created_at", { ascending: false })
      .limit(20),
    readTemplateFavorites(account.id),
    storedBatchOptions(account.id)
  ]);
  if (jobs.error) throw new Error(jobs.error.message);
  const metaConfigured = Boolean(process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim());
  return {
    folder,
    accounts,
    accountId: account.id,
    ...options,
    favoriteTemplateIds,
    presets,
    suggestions,
    recentJobs: (jobs.data as BatchLaunchJobRow[]).map(mapLaunchJob),
    metaConfigured
  };
}

async function storedBatchOptions(accountId: string) {
  const db = createSupabaseServiceRoleClient();
  const [cs, ts] = await Promise.all([
    db
      .from("meta_campaigns")
      .select("meta_campaign_id,name,objective,status,raw")
      .eq("ad_account_id", accountId)
      .in("status", ["ACTIVE", "PAUSED"])
      .limit(1000),
    db
      .from("meta_ad_sets")
      .select("meta_adset_id,name,raw")
      .eq("ad_account_id", accountId)
      .in("status", ["ACTIVE", "PAUSED"])
      .limit(1000)
  ]);
  if (cs.error || ts.error) throw new Error(cs.error?.message ?? ts.error?.message);
  const campaigns = (cs.data ?? []).map((row) =>
    mapBatchCampaign({
      ...row.raw,
      id: row.meta_campaign_id,
      name: row.name,
      objective: row.objective,
      status: row.status
    })
  );
  const templates = (ts.data ?? []).map((row) => ({
    id: row.meta_adset_id,
    name: row.name,
    campaignId: row.raw?.campaign_id ?? "",
    raw: row.raw ?? {}
  }));
  return { campaigns, templates };
}

export async function getBatchLaunchMedia(clientId: string, folderId: string): Promise<BatchLaunchMedia> {
  await launchFolder(clientId, folderId);
  const media = await listBatchMedia(folderId);
  const { matchBatchMedia } = await import("@/lib/batch-media-matching");
  return { ...media, ...(await matchBatchMedia(media.files)) };
}

export async function getBatchLaunchOptions(clientId: string, accountId: string) {
  // Validate ownership on every request, including cache hits.
  const account = await launchAccount(clientId, accountId);
  return process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()
    ? getLiveBatchOptions(account.meta_account_id)
    : storedBatchOptions(accountId);
}

export async function createBatchLaunch(clientId: string, input: BatchLaunchInput) {
  if (!input || !/^\d+$/.test(input.campaignId) || !/^\d+$/.test(input.templateId))
    throw new Error("Kampagne oder Vorlagen-Adset fehlt.");
  const account = await launchAccount(clientId, input.accountId);
  const folder = await launchFolder(clientId, input.folderId);
  input = { ...input, name: batchAdsetName(folder.name) };
  validateCopy(input.copy);
  const [media, rawCampaign, template] = await Promise.all([
    listBatchMedia(input.folderId),
    metaLaunchRequest<Record<string, unknown>>(`${input.campaignId}?fields=${BATCH_CAMPAIGN_FIELDS}`),
    metaLaunchRequest<Record<string, unknown>>(`${input.templateId}?fields=${BATCH_TEMPLATE_FIELDS}`)
  ]);
  const metaId = account.meta_account_id.replace(/^act_/, "");
  if (String(rawCampaign.account_id) !== metaId || String(template.account_id) !== metaId)
    throw new Error("Kampagne oder Vorlage gehoert nicht zum Werbekonto.");
  if (rawCampaign.status !== "ACTIVE")
    throw new Error("Die Kampagne ist nicht mehr aktiv. Bitte eine aktive Kampagne auswaehlen.");
  const files = validateGroups(input.groups, media.files);
  const campaign = mapBatchCampaign(rawCampaign);
  validateLaunchActivation(input.activate, campaign, input.activationBudget);
  const adsetPayload = buildAdSetPayload(input.name, campaign, template, input.settings, account.currency);
  // Validate with Meta before recording a job; this request creates no adset.
  await metaLaunchRequest(`${account.meta_account_id}/adsets`, {
    ...adsetPayload,
    execution_options: ["validate_only"]
  });
  const payload: BatchLaunchPayload = { input, files, metaAccountId: account.meta_account_id, campaign, adsetPayload };
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db
    .from("batch_launch_jobs")
    .insert({
      client_id: clientId,
      ad_account_id: account.id,
      drive_folder_id: input.folderId,
      meta_campaign_id: input.campaignId,
      name: input.name,
      payload
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const existing = await db
      .from("batch_launch_jobs")
      .select("*")
      .eq("client_id", clientId)
      .eq("ad_account_id", account.id)
      .eq("drive_folder_id", input.folderId)
      .eq("meta_campaign_id", input.campaignId)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    return mapLaunchJob(existing.data as BatchLaunchJobRow);
  }
  if (error) throw new Error(error.message);
  return mapLaunchJob(data as BatchLaunchJobRow);
}

export async function getBatchLaunchJob(clientId: string, jobId: string) {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from("batch_launch_jobs")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", jobId)
    .single();
  if (error) throw new Error(error.message);
  return data as BatchLaunchJobRow;
}
