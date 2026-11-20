import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getRequiredEnv } from "@/lib/env";
import { metaLaunchRequest } from "@/lib/meta/batch-launch";
import { BATCH_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import type { BatchOverviewItem } from "@/lib/batches";

export type AdsetStatus = {
  id: string;
  meta_adset_id: string;
  status: string | null;
  effective_status: string | null;
  raw?: Record<string, unknown>;
  updated_at?: string;
};
type MetaStatus = { status: string; effective_status: string; start_time?: string | null; end_time?: string | null };
type StoredMatch = {
  id: string;
  match_id: string;
  status: string;
  match_status: string | null;
  match_effective_status: string | null;
};
export type BatchStatusRefreshResult = {
  changed: boolean;
  checked: number;
  unavailable: number;
  checkedAt: string;
};

export function isBatchMetaLive(status: string | null, effectiveStatus: string | null) {
  const configured = status?.trim().toUpperCase();
  const effective = effectiveStatus?.trim().toUpperCase();
  return (!configured || configured === "ACTIVE") && (effective || configured) === "ACTIVE";
}

export function batchAdsetSchedule(raw?: Record<string, unknown>) {
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
  return { startTime: date(raw?.start_time), endTime: date(raw?.end_time) };
}

export function getBatchMetaState(status: string | null, effectiveStatus: string | null, startTime?: string | null, endTime?: string | null): "live" | "scheduled" | "found" {
  const now = Date.now();
  if (endTime && Date.parse(endTime) <= now) return "found";
  if (startTime && Date.parse(startTime) > now) {
    const configured = status?.trim().toUpperCase();
    const effective = effectiveStatus?.trim().toUpperCase();
    return (!configured || configured === "ACTIVE") && ["ACTIVE", "PENDING_REVIEW", "PREAPPROVED", "IN_PROCESS"].includes(effective || configured || "")
      ? "scheduled" : "found";
  }
  return isBatchMetaLive(status, effectiveStatus) ? "live" : "found";
}

export async function saveBatchAdsetSchedule(clientId: string, adset: AdsetStatus, remote: { start_time?: string | null; end_time?: string | null }) {
  const previous = batchAdsetSchedule(adset.raw);
  const next = batchAdsetSchedule({
    start_time: remote.start_time === undefined ? previous.startTime : remote.start_time,
    end_time: remote.end_time ?? null
  });
  if (previous.startTime === next.startTime && previous.endTime === next.endTime) return false;
  if (!adset.updated_at) throw new Error("Meta-Zeitplan konnte nicht gespeichert werden. Bitte erneut pruefen.");
  const raw = { ...adset.raw, start_time: next.startTime, end_time: next.endTime };
  // Do not overwrite targeting/creative metadata written by a concurrent full sync.
  const { data, error } = await createSupabaseServiceRoleClient().from("meta_ad_sets").update({ raw })
    .eq("client_id", clientId).eq("id", adset.id).eq("updated_at", adset.updated_at).select("id");
  if (error || !data?.length) throw new Error("Meta-Zeitplan konnte nicht gespeichert werden. Bitte erneut pruefen.");
  adset.raw = raw;
  return true;
}

export async function readBatchAdsetStatuses(clientId: string, ids: string[]): Promise<AdsetStatus[]> {
  const db = createSupabaseServiceRoleClient();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: AdsetStatus[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    const { data, error } = await db.from("meta_ad_sets")
      .select("id,meta_adset_id,status,effective_status,raw,updated_at")
      .eq("client_id", clientId).in("id", uniqueIds.slice(offset, offset + 200));
    if (error) throw new Error("Gespeicherter Meta-Status konnte nicht geladen werden.");
    rows.push(...(data ?? []) as AdsetStatus[]);
  }
  return rows;
}

export function applyBatchAdsetStatuses(items: BatchOverviewItem[], adsets: AdsetStatus[]) {
  const byId = new Map(adsets.map((adset) => [adset.id, adset]));
  return items.map((item): BatchOverviewItem => {
    const current = item.match && byId.get(item.match.id);
    if (!current || !item.match || (!current.status && !current.effective_status)) return item;
    const schedule = batchAdsetSchedule(current.raw);
    return {
      ...item,
      status: getBatchMetaState(current.status, current.effective_status, schedule.startTime, schedule.endTime),
      match: { ...item.match, status: current.status, effectiveStatus: current.effective_status, ...schedule }
    };
  });
}

const refreshes = new Map<string, { expires: number; promise: Promise<BatchStatusRefreshResult> }>();

export function refreshBatchMetaStatuses(clientId: string) {
  const tokenHash = createHash("sha256").update(getRequiredEnv("META_SYSTEM_USER_ACCESS_TOKEN")).digest("hex");
  const key = `${clientId}:${process.env.META_API_VERSION || "v25.0"}:${tokenHash}`;
  const cached = refreshes.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const entry = { expires: Infinity, promise: refreshStatuses(clientId) };
  if (refreshes.size >= 50) refreshes.delete(refreshes.keys().next().value!);
  refreshes.set(key, entry);
  // Also cool down failed reads; multiple tabs must not hammer a rate-limited account.
  void entry.promise.then(
    () => { entry.expires = Date.now() + 45_000; },
    () => { entry.expires = Date.now() + 45_000; }
  );
  return entry.promise;
}

async function refreshStatuses(clientId: string): Promise<BatchStatusRefreshResult> {
  const db = createSupabaseServiceRoleClient();
  const matches: StoredMatch[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("batch_folder_checks")
      .select("id,match_id,status,match_status,match_effective_status")
      .eq("client_id", clientId).eq("match_type", "adset").not("match_id", "is", null)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error("Batch-Zuordnungen konnten nicht geladen werden.");
    matches.push(...(data ?? []) as StoredMatch[]);
    if ((data?.length ?? 0) < 500) break;
  }
  const adsets = await readBatchAdsetStatuses(clientId, matches.map((match) => match.match_id));
  const ids = [...new Set(adsets.map((adset) => adset.meta_adset_id).filter((id) => /^\d+$/.test(id)))];
  const current = new Map<string, MetaStatus>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const response = await metaLaunchRequest<Record<string, Partial<MetaStatus> & { id?: string }>>(
      `?ids=${encodeURIComponent(batch.join(","))}&fields=id,status,effective_status,start_time,end_time`
    );
    for (const id of batch) {
      const value = response[id];
      if (value?.id === id && typeof value.status === "string" && value.status &&
          typeof value.effective_status === "string" && value.effective_status)
        current.set(id, { status: value.status, effective_status: value.effective_status, start_time: value.start_time, end_time: value.end_time });
    }
  }
  let changed = false;
  const groups = new Map<string, { status: string; effective_status: string; batchStatus: "live" | "found"; adsets: AdsetStatus[] }>();
  for (const adset of adsets) {
    const status = current.get(adset.meta_adset_id);
    if (!status) continue;
    if (await saveBatchAdsetSchedule(clientId, adset, status)) changed = true;
    const schedule = batchAdsetSchedule(adset.raw);
    const batchStatus = getBatchMetaState(status.status, status.effective_status, schedule.startTime, schedule.endTime) === "live" ? "live" : "found";
    const key = JSON.stringify([status.status, status.effective_status, batchStatus]);
    const group = groups.get(key) ?? { status: status.status, effective_status: status.effective_status, batchStatus, adsets: [] };
    group.adsets.push(adset);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const status = group.batchStatus;
    const adsetIds = new Set(group.adsets.map((adset) => adset.id));
    const changedAdsets = group.adsets.filter((adset) => adset.status !== group.status || adset.effective_status !== group.effective_status);
    for (let offset = 0; offset < changedAdsets.length; offset += 200) {
      const { error } = await db.from("meta_ad_sets")
        .update({ status: group.status, effective_status: group.effective_status })
        .eq("client_id", clientId).in("id", changedAdsets.slice(offset, offset + 200).map((adset) => adset.id));
      if (error) throw new Error("Meta-Status konnte nicht gespeichert werden.");
      changed = true;
    }
    const changedMatches = matches.filter((match) => adsetIds.has(match.match_id) &&
      (match.status !== status || match.match_status !== group.status || match.match_effective_status !== group.effective_status));
    for (let offset = 0; offset < changedMatches.length; offset += 200) {
      const chunk = changedMatches.slice(offset, offset + 200);
      const { error } = await db.from("batch_folder_checks")
        .update({ status, match_status: group.status, match_effective_status: group.effective_status })
        .eq("client_id", clientId).eq("match_type", "adset")
        .in("id", chunk.map((match) => match.id)).in("match_id", [...new Set(chunk.map((match) => match.match_id))]);
      if (error) throw new Error("Batch-Status konnte nicht gespeichert werden.");
      changed = true;
    }
  }
  if (changed) revalidateCacheTags(...BATCH_CACHE_TAGS);
  return {
    changed,
    checked: current.size,
    unavailable: new Set(matches.map((match) => match.match_id)).size - adsets.filter((adset) => current.has(adset.meta_adset_id)).length,
    checkedAt: new Date().toISOString()
  };
}
