import "server-only";

import { CACHE_TAGS, COMPETITOR_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getOptionalEnv } from "@/lib/env";
import { getCompetitorOverview } from "@/lib/competitors";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const ACTIVE_JOB_STATUSES = ["pending", "running", "retry"];

type CompetitorCrawlJobRow = {
  id: string;
  client_id: string;
  source_id: string;
  competitor_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  imported_items: number;
  skipped_items: number;
  error_message: string | null;
  worker_id: string | null;
  locked_at: string | null;
  run_after: string | null;
  started_at: string | null;
  last_heartbeat_at: string | null;
  finished_at: string | null;
  raw: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
};

type SourceWithCompetitorRow = {
  id: string;
  client_id: string;
  competitor_id: string | null;
  url: string;
  status: string;
  raw?: Record<string, unknown> | null;
  competitors?: { crawl_enabled?: boolean | null } | null;
};

export type CompetitorCrawlJob = {
  id: string;
  clientId: string;
  sourceId: string;
  competitorId: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  importedItems: number;
  skippedItems: number;
  errorMessage: string | null;
  workerId: string | null;
  lockedAt: string | null;
  runAfter: string | null;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  finishedAt: string | null;
  raw: Record<string, unknown>;
  createdAt: string;
};

function revalidateCompetitorCaches() {
  try {
    revalidateCacheTags(CACHE_TAGS.competitors, ...COMPETITOR_CACHE_TAGS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("static generation store missing")) throw error;
  }
}

function maxAttempts() {
  const value = Number(getOptionalEnv("COMPETITOR_CRAWL_JOB_MAX_ATTEMPTS", "3"));
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 3));
}

function retryDelayMs(attempts: number) {
  const baseSeconds = Number(getOptionalEnv("COMPETITOR_CRAWL_JOB_RETRY_BASE_SECONDS", "120"));
  const seconds = Math.max(30, Math.floor(Number.isFinite(baseSeconds) ? baseSeconds : 120));
  return Math.min(30 * 60 * 1000, seconds * attempts * 1000);
}

function staleRunningCutoffDate() {
  const minutesValue = Number(getOptionalEnv("COMPETITOR_CRAWL_JOB_STALE_RUNNING_MINUTES", "45"));
  const minutes = Math.max(10, Math.floor(Number.isFinite(minutesValue) ? minutesValue : 45));
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function mapJob(row: CompetitorCrawlJobRow): CompetitorCrawlJob {
  return {
    id: row.id,
    clientId: row.client_id,
    sourceId: row.source_id,
    competitorId: row.competitor_id,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    importedItems: row.imported_items,
    skippedItems: row.skipped_items,
    errorMessage: row.error_message,
    workerId: row.worker_id,
    lockedAt: row.locked_at,
    runAfter: row.run_after,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    finishedAt: row.finished_at,
    raw: row.raw ?? {},
    createdAt: row.created_at
  };
}

export async function enqueueCompetitorCrawlJob(clientId: string, sourceId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: source, error: sourceError } = await supabase
    .from("competitor_ad_library_sources")
    .select("id,client_id,competitor_id,url,status,raw,competitors(crawl_enabled)")
    .eq("client_id", clientId)
    .eq("id", sourceId)
    .single();

  if (sourceError || !source) throw new Error(sourceError?.message ?? "Competitor Source wurde nicht gefunden.");

  const typedSource = source as SourceWithCompetitorRow;
  if (typedSource.competitors?.crawl_enabled === false) {
    throw new Error("Dieser Competitor ist in den Competitor Settings nicht zum Crawlen verbunden.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("competitor_crawl_jobs")
    .select("id,client_id,source_id,competitor_id,status,attempts,max_attempts,imported_items,skipped_items,error_message,worker_id,locked_at,run_after,started_at,last_heartbeat_at,finished_at,raw,created_at")
    .eq("source_id", sourceId)
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    await supabase
      .from("competitor_ad_library_sources")
      .update({ status: existing.status === "running" ? "running" : "pending", error_message: null })
      .eq("id", sourceId);
    revalidateCompetitorCaches();
    return { job: mapJob(existing as CompetitorCrawlJobRow), overview: await getCompetitorOverview(clientId) };
  }

  const { data: job, error: jobError } = await supabase
    .from("competitor_crawl_jobs")
    .insert({
      client_id: clientId,
      source_id: sourceId,
      competitor_id: typedSource.competitor_id,
      status: "pending",
      max_attempts: maxAttempts(),
      run_after: new Date().toISOString(),
      raw: { sourceUrl: typedSource.url }
    })
    .select("id,client_id,source_id,competitor_id,status,attempts,max_attempts,imported_items,skipped_items,error_message,worker_id,locked_at,run_after,started_at,last_heartbeat_at,finished_at,raw,created_at")
    .single();

  if (jobError || !job) throw new Error(jobError?.message ?? "Competitor Crawl Job konnte nicht erstellt werden.");

  const { error: sourceUpdateError } = await supabase
    .from("competitor_ad_library_sources")
    .update({ status: "pending", error_message: null })
    .eq("id", sourceId);
  if (sourceUpdateError) throw new Error(sourceUpdateError.message);

  revalidateCompetitorCaches();
  return { job: mapJob(job as CompetitorCrawlJobRow), overview: await getCompetitorOverview(clientId) };
}

export async function resetStaleCompetitorCrawlJobs() {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("competitor_crawl_jobs")
    .update({
      status: "retry",
      error_message: "Worker Heartbeat Timeout, Job erneut eingeplant.",
      worker_id: null,
      locked_at: null,
      run_after: new Date().toISOString()
    })
    .eq("status", "running")
    .lte("last_heartbeat_at", staleRunningCutoffDate());

  if (error) throw new Error(error.message);
}

export async function claimNextCompetitorCrawlJob(workerId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { data: candidates, error: candidatesError } = await supabase
    .from("competitor_crawl_jobs")
    .select("id,status")
    .in("status", ["pending", "retry"])
    .lte("run_after", now)
    .order("created_at", { ascending: true })
    .limit(5);

  if (candidatesError) throw new Error(candidatesError.message);

  for (const candidate of candidates ?? []) {
    const { data: claimed, error: claimError } = await supabase
      .from("competitor_crawl_jobs")
      .update({
        status: "running",
        worker_id: workerId,
        locked_at: now,
        last_heartbeat_at: now,
        started_at: now,
        error_message: null
      })
      .eq("id", candidate.id)
      .eq("status", candidate.status)
      .select("id,client_id,source_id,competitor_id,status,attempts,max_attempts,imported_items,skipped_items,error_message,worker_id,locked_at,run_after,started_at,last_heartbeat_at,finished_at,raw,created_at")
      .maybeSingle();

    if (claimError) throw new Error(claimError.message);
    if (!claimed) continue;

    const row = claimed as CompetitorCrawlJobRow;
    const attempts = row.attempts + 1;
    const { data: withAttempt, error: attemptError } = await supabase
      .from("competitor_crawl_jobs")
      .update({ attempts })
      .eq("id", row.id)
      .eq("worker_id", workerId)
      .eq("status", "running")
      .select("id,client_id,source_id,competitor_id,status,attempts,max_attempts,imported_items,skipped_items,error_message,worker_id,locked_at,run_after,started_at,last_heartbeat_at,finished_at,raw,created_at")
      .single();

    if (attemptError || !withAttempt) throw new Error(attemptError?.message ?? "Competitor Crawl Job konnte nicht geclaimt werden.");
    return mapJob(withAttempt as CompetitorCrawlJobRow);
  }

  return null;
}

export async function heartbeatCompetitorCrawlJob(jobId: string, workerId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("competitor_crawl_jobs")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .eq("status", "running");
  if (error) throw new Error(error.message);
}

export async function completeCompetitorCrawlJob(jobId: string, workerId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: job, error: jobError } = await supabase
    .from("competitor_crawl_jobs")
    .select("id,client_id,source_id,competitor_id,status,attempts,max_attempts,imported_items,skipped_items,error_message,worker_id,locked_at,run_after,started_at,last_heartbeat_at,finished_at,raw,created_at")
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .single();

  if (jobError || !job) throw new Error(jobError?.message ?? "Competitor Crawl Job wurde nicht gefunden.");

  const typedJob = job as CompetitorCrawlJobRow;
  const { data: source } = await supabase
    .from("competitor_ad_library_sources")
    .select("raw")
    .eq("id", typedJob.source_id)
    .maybeSingle();

  const sourceRaw = (source?.raw ?? {}) as Record<string, unknown>;
  const imported = Number(sourceRaw.imported ?? 0);
  const skippedExisting = Number(sourceRaw.skippedExisting ?? 0);

  const { data: completed, error } = await supabase
    .from("competitor_crawl_jobs")
    .update({
      status: "completed",
      imported_items: Number.isFinite(imported) ? imported : 0,
      skipped_items: Number.isFinite(skippedExisting) ? skippedExisting : 0,
      error_message: null,
      finished_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
      raw: { ...(typedJob.raw ?? {}), sourceRaw }
    })
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .select("id,client_id,source_id,competitor_id,status,attempts,max_attempts,imported_items,skipped_items,error_message,worker_id,locked_at,run_after,started_at,last_heartbeat_at,finished_at,raw,created_at")
    .single();

  if (error || !completed) throw new Error(error?.message ?? "Competitor Crawl Job konnte nicht abgeschlossen werden.");
  revalidateCompetitorCaches();
  return mapJob(completed as CompetitorCrawlJobRow);
}

export async function failCompetitorCrawlJob(job: CompetitorCrawlJob, workerId: string, error: unknown) {
  const supabase = createSupabaseServiceRoleClient();
  const message = error instanceof Error ? error.message : "Competitor Crawl fehlgeschlagen.";
  const shouldRetry = job.attempts < job.maxAttempts;
  const runAfter = new Date(Date.now() + retryDelayMs(job.attempts)).toISOString();

  const { data: failed, error: updateError } = await supabase
    .from("competitor_crawl_jobs")
    .update({
      status: shouldRetry ? "retry" : "failed",
      error_message: message,
      worker_id: shouldRetry ? null : workerId,
      locked_at: shouldRetry ? null : job.lockedAt,
      run_after: shouldRetry ? runAfter : job.runAfter,
      finished_at: shouldRetry ? null : new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString()
    })
    .eq("id", job.id)
    .eq("worker_id", workerId)
    .select("id,client_id,source_id,competitor_id,status,attempts,max_attempts,imported_items,skipped_items,error_message,worker_id,locked_at,run_after,started_at,last_heartbeat_at,finished_at,raw,created_at")
    .single();

  if (updateError || !failed) throw new Error(updateError?.message ?? "Competitor Crawl Job Fehlerstatus konnte nicht gespeichert werden.");
  if (shouldRetry) {
    await supabase
      .from("competitor_ad_library_sources")
      .update({ status: "pending", error_message: message })
      .eq("id", job.sourceId);
  }
  revalidateCompetitorCaches();
  return mapJob(failed as CompetitorCrawlJobRow);
}
