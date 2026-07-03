import "server-only";

import { BATCH_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type BatchSettings = {
  id: string;
  clientId: string;
  googleDriveFolderUrl: string | null;
  googleDriveFolderId: string;
  lastCheckedAt: string | null;
  lastCheckStartedAt: string | null;
  lastCheckStatus: "idle" | "running" | "completed" | "failed";
  lastCheckError: string | null;
  lastMetaEntitiesCount: number;
  lastDriveFolderCount: number;
  updatedAt: string | null;
};

export type DriveBatchFolder = {
  id: string;
  name: string;
  path: string;
  depth: number;
  webViewLink: string | null;
  modifiedTime: string | null;
};

export type BatchMetaMatch = {
  id: string;
  type: "ad" | "adset" | "campaign";
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  href: string | null;
};

export type BatchOverviewItem = {
  id: string;
  name: string;
  path: string;
  depth: number;
  webViewLink: string | null;
  modifiedTime: string | null;
  checkedAt: string | null;
  status: "live" | "found" | "missing";
  match: BatchMetaMatch | null;
};

export type BatchOverview = {
  settings: BatchSettings | null;
  items: BatchOverviewItem[];
  totals: {
    folders: number;
    live: number;
    found: number;
    missing: number;
    metaEntities: number;
  };
};

type BatchSettingsRow = {
  id: string;
  client_id: string;
  google_drive_folder_url: string | null;
  google_drive_folder_id: string;
  last_checked_at?: string | null;
  last_check_started_at?: string | null;
  last_check_status?: string | null;
  last_check_error?: string | null;
  last_meta_entities_count?: number | null;
  last_drive_folder_count?: number | null;
  updated_at: string | null;
};

type BatchFolderCheckRow = {
  id: string;
  client_id: string;
  drive_folder_id: string;
  name: string;
  path: string;
  depth: number | null;
  web_view_link: string | null;
  modified_time: string | null;
  status: string | null;
  match_type: string | null;
  match_id: string | null;
  match_name: string | null;
  match_status: string | null;
  match_effective_status: string | null;
  match_href: string | null;
  checked_at: string | null;
};

type MetaEntity = BatchMetaMatch & {
  normalizedName: string;
  live: boolean;
};

type DriveFilesResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    webViewLink?: string;
    modifiedTime?: string;
  }>;
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const LIVE_STATUSES = new Set(["ACTIVE"]);
const DEFAULT_DRIVE_SEARCH_DEPTH = 6;
const DEFAULT_DRIVE_SEARCH_LIMIT = 1500;
const BATCH_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function extractGoogleDriveFolderId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const foldersMatch = url.pathname.match(/\/folders\/([^/?#]+)/);
    if (foldersMatch?.[1]) return decodeURIComponent(foldersMatch[1]);

    const idParam = url.searchParams.get("id") ?? url.searchParams.get("folderId");
    if (idParam) return idParam.trim();
  } catch {
    // Plain folder IDs are accepted below.
  }

  return /^[A-Za-z0-9_-]{10,}$/.test(trimmed) ? trimmed : "";
}

function mapSettings(row: BatchSettingsRow): BatchSettings {
  const lastCheckStatus = row.last_check_status;

  return {
    id: row.id,
    clientId: row.client_id,
    googleDriveFolderUrl: row.google_drive_folder_url,
    googleDriveFolderId: row.google_drive_folder_id,
    lastCheckedAt: row.last_checked_at ?? null,
    lastCheckStartedAt: row.last_check_started_at ?? null,
    lastCheckStatus: lastCheckStatus === "running" || lastCheckStatus === "completed" || lastCheckStatus === "failed" ? lastCheckStatus : "idle",
    lastCheckError: row.last_check_error ?? null,
    lastMetaEntitiesCount: Number(row.last_meta_entities_count ?? 0),
    lastDriveFolderCount: Number(row.last_drive_folder_count ?? 0),
    updatedAt: row.updated_at
  };
}

function mapStoredItem(row: BatchFolderCheckRow): BatchOverviewItem {
  const matchType: BatchMetaMatch["type"] | null = row.match_type === "ad" || row.match_type === "adset" || row.match_type === "campaign" ? row.match_type : null;
  const match = matchType
    ? {
        id: row.match_id ?? "",
        type: matchType,
        name: row.match_name ?? "",
        status: row.match_status,
        effectiveStatus: row.match_effective_status,
        href: row.match_href
      }
    : null;
  const status = row.status === "live" || row.status === "found" || row.status === "missing" ? row.status : "missing";

  return {
    id: row.drive_folder_id,
    name: row.name,
    path: row.path,
    depth: Number(row.depth ?? 0),
    webViewLink: row.web_view_link,
    modifiedTime: row.modified_time,
    checkedAt: row.checked_at,
    status,
    match
  };
}

function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasBatchToken(value: string) {
  return /\bbatches?\b/.test(normalizeName(value));
}

function isGenericBatchContainerName(value: string) {
  const normalized = normalizeName(value);
  if (!hasBatchToken(normalized)) return false;

  return (
    normalized === "batch" ||
    normalized === "batches" ||
    normalized === "creative batch" ||
    normalized === "creative batches" ||
    normalized === "ad batch" ||
    normalized === "ad batches" ||
    normalized === "meta batch" ||
    normalized === "meta batches" ||
    /^batches? \d{4}$/.test(normalized) ||
    /^\d{4} batches?$/.test(normalized)
  );
}

function isGroupingFolderName(value: string) {
  const normalized = normalizeName(value);
  if (/^\d{4}$/.test(normalized)) return true;
  if (/^q[1-4]( \d{4})?$/.test(normalized)) return true;
  if (/^(kw|week|woche) \d{1,2}( \d{4})?$/.test(normalized)) return true;
  return /^(januar|februar|maerz|marz|april|mai|juni|juli|august|september|oktober|november|dezember|january|february|march|may|june|july|october|december)( \d{4})?$/.test(normalized);
}

function toPositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isLive(status: string | null, effectiveStatus: string | null) {
  const values = [status, effectiveStatus].map((value) => value?.toUpperCase()).filter(Boolean);
  return values.some((value) => LIVE_STATUSES.has(value as string));
}

function metaTypeLabel(type: BatchMetaMatch["type"]) {
  if (type === "ad") return "Ad";
  if (type === "adset") return "Ad Set";
  return "Campaign";
}

function metaTypeWeight(type: BatchMetaMatch["type"]) {
  if (type === "ad") return 0;
  if (type === "adset") return 1;
  return 2;
}

function sortMatches(left: MetaEntity, right: MetaEntity) {
  if (left.live !== right.live) return left.live ? -1 : 1;
  return metaTypeWeight(left.type) - metaTypeWeight(right.type);
}

function findMetaMatch(folderName: string, entities: MetaEntity[]) {
  const normalizedFolderName = normalizeName(folderName);
  if (!normalizedFolderName) return null;

  const exactMatches = entities.filter((entity) => entity.normalizedName === normalizedFolderName).sort(sortMatches);
  if (exactMatches[0]) return exactMatches[0];

  if (normalizedFolderName.length < 4) return null;

  const containsMatches = entities
    .filter((entity) => {
      if (entity.normalizedName.length < 4) return false;
      return entity.normalizedName.includes(normalizedFolderName) || normalizedFolderName.includes(entity.normalizedName);
    })
    .sort(sortMatches);

  return containsMatches[0] ?? null;
}

async function listGoogleDriveBatchFolders(folderId: string): Promise<{ folders: DriveBatchFolder[]; error: string | null }> {
  const apiKey = getOptionalEnv("GOOGLE_DRIVE_API_KEY");
  if (!apiKey) {
    return {
      folders: [],
      error: "GOOGLE_DRIVE_API_KEY fehlt. Die Batch Settings sind gespeichert, aber der Drive-Check kann noch nicht laufen."
    };
  }

  const maxDepth = toPositiveInt(getOptionalEnv("BATCH_DRIVE_SEARCH_DEPTH"), DEFAULT_DRIVE_SEARCH_DEPTH);
  const maxFolders = toPositiveInt(getOptionalEnv("BATCH_DRIVE_SEARCH_LIMIT"), DEFAULT_DRIVE_SEARCH_LIMIT);
  const directChildren: DriveBatchFolder[] = [];
  const batchCandidatesById = new Map<string, DriveBatchFolder>();
  const queue: Array<{ id: string; path: string; depth: number; childrenAreBatchCandidates: boolean }> = [
    { id: folderId, path: "", depth: 0, childrenAreBatchCandidates: false }
  ];
  let scannedFolders = 0;
  let limitReached = false;

  try {
    while (queue.length > 0) {
      if (scannedFolders >= maxFolders) {
        limitReached = true;
        break;
      }

      const parent = queue.shift()!;
      const childResult = await listGoogleDriveChildFolders(parent.id, apiKey);
      if (childResult.error) {
        return {
          folders: sortDriveFolders(Array.from(batchCandidatesById.values())),
          error: childResult.error
        };
      }

      for (const child of childResult.folders) {
        scannedFolders += 1;
        if (scannedFolders > maxFolders) {
          limitReached = true;
          break;
        }

        const path = parent.path ? `${parent.path} / ${child.name}` : child.name;
        const folder: DriveBatchFolder = {
          ...child,
          path,
          depth: parent.depth + 1
        };

        if (parent.depth === 0) directChildren.push(folder);

        const nameHasBatch = hasBatchToken(folder.name);
        const genericBatchContainer = isGenericBatchContainerName(folder.name);
        const groupingFolder = isGroupingFolderName(folder.name);
        const shouldInclude = (parent.childrenAreBatchCandidates && !groupingFolder) || (nameHasBatch && !genericBatchContainer);
        if (shouldInclude) batchCandidatesById.set(folder.id, folder);

        const childrenAreBatchCandidates = genericBatchContainer || (parent.childrenAreBatchCandidates && groupingFolder);
        if (folder.depth < maxDepth) {
          queue.push({
            id: folder.id,
            path: folder.path,
            depth: folder.depth,
            childrenAreBatchCandidates
          });
        }
      }
    }

    const folders = batchCandidatesById.size > 0 ? Array.from(batchCandidatesById.values()) : directChildren;
    return {
      folders: sortDriveFolders(folders),
      error: limitReached ? `Drive-Suche wurde nach ${maxFolders} Ordnern begrenzt. Erhoehe BATCH_DRIVE_SEARCH_LIMIT, falls Treffer fehlen.` : null
    };
  } catch (error) {
    return {
      folders: sortDriveFolders(Array.from(batchCandidatesById.values())),
      error: error instanceof Error ? error.message : "Google Drive Ordner konnten nicht geladen werden."
    };
  }
}

async function listGoogleDriveChildFolders(folderId: string, apiKey: string): Promise<{ folders: Omit<DriveBatchFolder, "path" | "depth">[]; error: string | null }> {
  const folders: Array<Omit<DriveBatchFolder, "path" | "depth">> = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      key: apiKey,
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
      fields: "nextPageToken,files(id,name,webViewLink,modifiedTime)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });

    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      cache: "no-store"
    });
    const data = (await response.json().catch(() => ({}))) as DriveFilesResponse;

    if (!response.ok) {
      return {
        folders,
        error: data.error?.message ?? "Google Drive Ordner konnten nicht geladen werden."
      };
    }

    folders.push(
      ...(data.files ?? [])
        .filter((file) => file.id && file.name)
        .map((file) => ({
          id: file.id as string,
          name: file.name as string,
          webViewLink: file.webViewLink ?? null,
          modifiedTime: file.modifiedTime ?? null
        }))
    );
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { folders, error: null };
}

function sortDriveFolders(folders: DriveBatchFolder[]) {
  return folders.sort((left, right) => left.path.localeCompare(right.path, "de"));
}

async function listMetaEntities(clientId: string): Promise<{ entities: MetaEntity[]; error: string | null }> {
  const supabase = createSupabaseServiceRoleClient();
  const [adsResult, adSetsResult, campaignsResult] = await Promise.all([
    supabase.from("meta_ads").select("id,creative_id,name,status,effective_status").eq("client_id", clientId),
    supabase.from("meta_ad_sets").select("id,name,status,effective_status").eq("client_id", clientId),
    supabase.from("meta_campaigns").select("id,name,status,effective_status").eq("client_id", clientId)
  ]);

  const error = adsResult.error ?? adSetsResult.error ?? campaignsResult.error;
  if (error) return { entities: [], error: error.message };

  const ads = (adsResult.data ?? [])
    .filter((row) => row.name)
    .map((row) => ({
      id: row.id,
      type: "ad" as const,
      name: row.name as string,
      status: row.status ?? null,
      effectiveStatus: row.effective_status ?? null,
      href: row.creative_id ? `/clients/${clientId}/creatives/${row.creative_id}` : null,
      normalizedName: normalizeName(row.name as string),
      live: isLive(row.status ?? null, row.effective_status ?? null)
    }));

  const adSets = (adSetsResult.data ?? [])
    .filter((row) => row.name)
    .map((row) => ({
      id: row.id,
      type: "adset" as const,
      name: row.name as string,
      status: row.status ?? null,
      effectiveStatus: row.effective_status ?? null,
      href: null,
      normalizedName: normalizeName(row.name as string),
      live: isLive(row.status ?? null, row.effective_status ?? null)
    }));

  const campaigns = (campaignsResult.data ?? [])
    .filter((row) => row.name)
    .map((row) => ({
      id: row.id,
      type: "campaign" as const,
      name: row.name as string,
      status: row.status ?? null,
      effectiveStatus: row.effective_status ?? null,
      href: null,
      normalizedName: normalizeName(row.name as string),
      live: isLive(row.status ?? null, row.effective_status ?? null)
    }));

  return {
    entities: [...ads, ...adSets, ...campaigns].filter((entity) => entity.normalizedName),
    error: null
  };
}

export async function getBatchSettings(clientId: string): Promise<{ settings: BatchSettings | null; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.from("batch_settings").select("*").eq("client_id", clientId).maybeSingle();

    if (error) return { settings: null, error: error.message };
    return {
      settings: data ? mapSettings(data as BatchSettingsRow) : null,
      error: null
    };
  } catch (error) {
    return {
      settings: null,
      error: error instanceof Error ? error.message : "Batch Settings konnten nicht geladen werden."
    };
  }
}

export async function upsertBatchSettings(clientId: string, input: { googleDriveFolderUrl: string }) {
  const googleDriveFolderUrl = input.googleDriveFolderUrl.trim();
  const googleDriveFolderId = extractGoogleDriveFolderId(googleDriveFolderUrl);

  if (!googleDriveFolderUrl) throw new Error("Google Drive Ordner fehlt.");
  if (!googleDriveFolderId) throw new Error("Google Drive Ordner-ID konnte nicht erkannt werden.");

  const supabase = createSupabaseServiceRoleClient();
  const { data: existingSettings } = await supabase
    .from("batch_settings")
    .select("google_drive_folder_id")
    .eq("client_id", clientId)
    .maybeSingle();
  const folderChanged = existingSettings?.google_drive_folder_id !== googleDriveFolderId;

  const { data, error } = await supabase
    .from("batch_settings")
    .upsert({
      client_id: clientId,
      google_drive_folder_url: googleDriveFolderUrl,
      google_drive_folder_id: googleDriveFolderId,
      last_checked_at: folderChanged ? null : undefined,
      last_check_started_at: null,
      last_check_status: folderChanged ? "idle" : undefined,
      last_check_error: null,
      last_meta_entities_count: folderChanged ? 0 : undefined,
      last_drive_folder_count: folderChanged ? 0 : undefined
    }, { onConflict: "client_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (folderChanged) {
    const { error: deleteError } = await supabase.from("batch_folder_checks").delete().eq("client_id", clientId);
    if (deleteError) throw new Error(deleteError.message);
  }

  revalidateCacheTags(...BATCH_CACHE_TAGS);
  return mapSettings(data as BatchSettingsRow);
}

export async function getBatchOverview(clientId: string): Promise<BatchOverview> {
  const { settings, error: settingsError } = await getBatchSettings(clientId);
  if (!settings) {
    return {
      settings: null,
      items: [],
      totals: { folders: 0, live: 0, found: 0, missing: 0, metaEntities: 0 }
    };
  }

  const { items, error } = await listStoredBatchItems(clientId);
  const overviewItems = error ? [] : items;

  return {
    settings: {
      ...settings,
      lastCheckError: settingsError ?? error ?? settings.lastCheckError
    },
    items: overviewItems,
    totals: {
      folders: overviewItems.length,
      live: overviewItems.filter((item) => item.status === "live").length,
      found: overviewItems.filter((item) => item.status === "found").length,
      missing: overviewItems.filter((item) => item.status === "missing").length,
      metaEntities: settings.lastMetaEntitiesCount
    }
  };
}

async function listStoredBatchItems(clientId: string): Promise<{ items: BatchOverviewItem[]; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("batch_folder_checks")
      .select("*")
      .eq("client_id", clientId)
      .order("path", { ascending: true });

    if (error) return { items: [], error: error.message };
    return { items: ((data ?? []) as BatchFolderCheckRow[]).map(mapStoredItem), error: null };
  } catch (error) {
    return {
      items: [],
      error: error instanceof Error ? error.message : "Batch Snapshots konnten nicht geladen werden."
    };
  }
}

export async function runBatchCheck(clientId: string) {
  const { settings, error: settingsError } = await getBatchSettings(clientId);
  if (settingsError) throw new Error(settingsError);
  if (!settings) throw new Error("Kein Google Drive Batch-Ordner gespeichert.");

  const supabase = createSupabaseServiceRoleClient();
  const startedAt = new Date().toISOString();
  await supabase
    .from("batch_settings")
    .update({
      last_check_started_at: startedAt,
      last_check_status: "running",
      last_check_error: null
    })
    .eq("client_id", clientId);

  try {
    const [driveResult, metaResult] = await Promise.all([
      listGoogleDriveBatchFolders(settings.googleDriveFolderId),
      listMetaEntities(clientId)
    ]);
    const error = driveResult.error ?? metaResult.error;
    if (error) throw new Error(error);

    const checkedAt = new Date().toISOString();
    const items = driveResult.folders.map((folder) => {
      const match = findMetaMatch(folder.name, metaResult.entities);
      const status: BatchOverviewItem["status"] = match ? (match.live ? "live" : "found") : "missing";

      return {
        ...folder,
        checkedAt,
        status,
        match: match
          ? {
              id: match.id,
              type: match.type,
              name: match.name,
              status: match.status,
              effectiveStatus: match.effectiveStatus,
              href: match.href
            }
          : null
      } satisfies BatchOverviewItem;
    });

    await replaceStoredBatchItems(clientId, items);
    const { data, error: updateError } = await supabase
      .from("batch_settings")
      .update({
        last_checked_at: checkedAt,
        last_check_started_at: null,
        last_check_status: "completed",
        last_check_error: null,
        last_meta_entities_count: metaResult.entities.length,
        last_drive_folder_count: driveResult.folders.length
      })
      .eq("client_id", clientId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    revalidateCacheTags(...BATCH_CACHE_TAGS);
    return {
      settings: mapSettings(data as BatchSettingsRow),
      items,
      totals: {
        folders: items.length,
        live: items.filter((item) => item.status === "live").length,
        found: items.filter((item) => item.status === "found").length,
        missing: items.filter((item) => item.status === "missing").length,
        metaEntities: metaResult.entities.length
      }
    } satisfies BatchOverview;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch Check fehlgeschlagen.";
    await supabase
      .from("batch_settings")
      .update({
        last_check_started_at: null,
        last_check_status: "failed",
        last_check_error: message
      })
      .eq("client_id", clientId);
    revalidateCacheTags(...BATCH_CACHE_TAGS);
    throw new Error(message);
  }
}

async function replaceStoredBatchItems(clientId: string, items: BatchOverviewItem[]) {
  const supabase = createSupabaseServiceRoleClient();
  const rows = items.map((item) => ({
    client_id: clientId,
    drive_folder_id: item.id,
    name: item.name,
    path: item.path,
    depth: item.depth,
    web_view_link: item.webViewLink,
    modified_time: item.modifiedTime,
    status: item.status,
    match_type: item.match?.type ?? null,
    match_id: item.match?.id || null,
    match_name: item.match?.name ?? null,
    match_status: item.match?.status ?? null,
    match_effective_status: item.match?.effectiveStatus ?? null,
    match_href: item.match?.href ?? null,
    checked_at: item.checkedAt
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("batch_folder_checks")
      .upsert(rows, { onConflict: "client_id,drive_folder_id" });
    if (upsertError) throw new Error(upsertError.message);
  }

  const currentIds = items.map((item) => item.id);
  let deleteQuery = supabase.from("batch_folder_checks").delete().eq("client_id", clientId);
  if (currentIds.length > 0) deleteQuery = deleteQuery.not("drive_folder_id", "in", `(${currentIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error(deleteError.message);
}

export async function runDueBatchChecks() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("batch_settings")
    .select("client_id,last_checked_at,clients(status)")
    .not("google_drive_folder_id", "is", null);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ client_id: string; last_checked_at: string | null; clients?: { status?: string | null } | null }>;
  const dueRows = rows.filter((row) => row.clients?.status !== "archived" && isBatchSnapshotStale(row.last_checked_at));
  const results: Array<{ clientId: string; status: string; folders?: number; error?: string }> = [];

  for (const row of dueRows) {
    try {
      const overview = await runBatchCheck(row.client_id);
      results.push({ clientId: row.client_id, status: "completed", folders: overview.totals.folders });
    } catch (error) {
      results.push({
        clientId: row.client_id,
        status: "failed",
        error: error instanceof Error ? error.message : "Batch Check fehlgeschlagen."
      });
    }
  }

  return { clients: rows.length, due: dueRows.length, results };
}

export function isBatchSnapshotStale(value: string | null) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() - date.getTime() >= BATCH_CHECK_INTERVAL_MS;
}

export function batchStatusLabel(status: BatchOverviewItem["status"]) {
  if (status === "live") return "Geschaltet";
  if (status === "found") return "Gefunden, nicht aktiv";
  return "Nicht gefunden";
}

export function batchMetaMatchLabel(match: BatchMetaMatch) {
  return `${metaTypeLabel(match.type)}: ${match.name}`;
}
