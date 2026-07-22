import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getOptionalEnv } from "@/lib/env";
import { syncMetaForClient, syncMetaInsightsForClient } from "@/lib/meta/sync";

type BackfillJobRow = {
  id: string;
  client_id: string;
  ad_account_id: string;
  status: string;
  since: string;
  until: string;
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
  total_insights: number;
  pause_until: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type BackfillChunkRow = {
  id: string;
  job_id: string;
  chunk_index: number;
  since: string;
  until: string;
  status: string;
  attempts: number;
  insights: number;
  error_message: string | null;
  run_after?: string | null;
};

const ACTIVE_JOB_STATUSES = ["pending", "running", "paused"];
const DEFAULT_RETRY_MINUTES = 15;

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateInput(date);
}

function dateYearsAgo(years: number) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return formatDateInput(date);
}

function today() {
  return formatDateInput(new Date());
}

function chunkDateRange(range: { since: string; until: string }) {
  const configuredDays = Number(getOptionalEnv("META_BACKFILL_CHUNK_DAYS", getOptionalEnv("META_SYNC_INSIGHT_CHUNK_DAYS", "30")));
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

function rateLimitPauseDate() {
  const pauseMinutes = Number(getOptionalEnv("META_BACKFILL_RATE_LIMIT_PAUSE_MINUTES", String(DEFAULT_RETRY_MINUTES)));
  const minutes = Math.max(5, Math.floor(Number.isFinite(pauseMinutes) ? pauseMinutes : DEFAULT_RETRY_MINUTES));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function retryDate(attempts: number) {
  const minutes = Math.min(60, Math.max(2, attempts * 5));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /rate limit|request limit|too many calls|calls to this api|temporarily blocked/i.test(message);
}

function staleRunningCutoffDate() {
  const minutesValue = Number(getOptionalEnv("META_BACKFILL_STALE_RUNNING_MINUTES", String(DEFAULT_RETRY_MINUTES)));
  const minutes = Math.max(5, Math.floor(Number.isFinite(minutesValue) ? minutesValue : DEFAULT_RETRY_MINUTES));
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

async function resetStaleRunningChunks(jobId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const cutoff = staleRunningCutoffDate();
  const { error } = await supabase
    .from("meta_backfill_chunks")
    .update({ status: "pending", run_after: new Date().toISOString(), error_message: "Running Chunk nach Timeout erneut eingeplant." })
    .eq("job_id", jobId)
    .eq("status", "running")
    .lte("started_at", cutoff);

  if (error) throw new Error(error.message);
}

function mapJob(job: BackfillJobRow | null, chunks?: BackfillChunkRow[]) {
  if (!job) return null;
  const completedChunks = chunks ? chunks.filter((chunk) => chunk.status === "completed").length : job.completed_chunks;
  const failedChunks = chunks ? chunks.filter((chunk) => chunk.status === "failed").length : job.failed_chunks;
  const totalInsights = chunks ? chunks.reduce((sum, chunk) => sum + Number(chunk.insights ?? 0), 0) : job.total_insights;
  const percent = job.total_chunks > 0 ? Math.round((completedChunks / job.total_chunks) * 100) : 0;
  const nextChunk = chunks?.find((chunk) => chunk.status === "pending" || chunk.status === "running") ?? null;

  return {
    id: job.id,
    status: job.status,
    since: job.since,
    until: job.until,
    totalChunks: job.total_chunks,
    completedChunks,
    failedChunks,
    totalInsights,
    percent,
    pauseUntil: job.pause_until,
    errorMessage: job.error_message,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    createdAt: job.created_at,
    nextChunk: nextChunk
      ? {
          index: nextChunk.chunk_index,
          since: nextChunk.since,
          until: nextChunk.until,
          status: nextChunk.status,
          attempts: nextChunk.attempts
        }
      : null
  };
}

async function syncJobProgress(job: BackfillJobRow) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: chunks, error } = await supabase
    .from("meta_backfill_chunks")
    .select("id,job_id,chunk_index,since,until,status,attempts,insights,error_message,run_after")
    .eq("job_id", job.id)
    .order("chunk_index", { ascending: true });

  if (error) throw new Error(error.message);

  const typedChunks = (chunks ?? []) as BackfillChunkRow[];
  const completedChunks = typedChunks.filter((chunk) => chunk.status === "completed").length;
  const failedChunks = typedChunks.filter((chunk) => chunk.status === "failed").length;
  const pendingChunks = typedChunks.filter((chunk) => chunk.status === "pending");
  const runningChunks = typedChunks.filter((chunk) => chunk.status === "running");
  const totalInsights = typedChunks.reduce((sum, chunk) => sum + Number(chunk.insights ?? 0), 0);
  const unfinishedChunks = pendingChunks.length + runningChunks.length;
  const nextRunAfter = pendingChunks
    .map((chunk) => chunk.run_after)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const shouldPause = unfinishedChunks > 0 && Boolean(nextRunAfter) && new Date(nextRunAfter as string).getTime() > Date.now();
  const status = unfinishedChunks > 0 ? (shouldPause ? "paused" : "running") : failedChunks > 0 ? "failed" : "completed";

  const { error: updateError } = await supabase
    .from("meta_backfill_jobs")
    .update({
      status,
      completed_chunks: completedChunks,
      failed_chunks: failedChunks,
      total_insights: totalInsights,
      pause_until: status === "paused" ? nextRunAfter : null,
      finished_at: status === "completed" || status === "failed" ? new Date().toISOString() : null
    })
    .eq("id", job.id);

  if (updateError) throw new Error(updateError.message);
}

export async function getLatestMetaBackfillStatus(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: job, error: jobError } = await supabase
    .from("meta_backfill_jobs")
    .select("id,client_id,ad_account_id,status,since,until,total_chunks,completed_chunks,failed_chunks,total_insights,pause_until,error_message,started_at,finished_at,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return null;

  const { data: chunks, error: chunksError } = await supabase
    .from("meta_backfill_chunks")
    .select("id,job_id,chunk_index,since,until,status,attempts,insights,error_message,run_after")
    .eq("job_id", job.id)
    .order("chunk_index", { ascending: true });

  if (chunksError) throw new Error(chunksError.message);
  return mapJob(job as BackfillJobRow, (chunks ?? []) as BackfillChunkRow[]);
}

export async function startMetaBackfill(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: existing, error: existingError } = await supabase
    .from("meta_backfill_jobs")
    .select("id,client_id,ad_account_id,status,since,until,total_chunks,completed_chunks,failed_chunks,total_insights,pause_until,error_message,started_at,finished_at,created_at")
    .eq("client_id", clientId)
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return getLatestMetaBackfillStatus(clientId);

  const { data: account, error: accountError } = await supabase
    .from("meta_ad_accounts")
    .select("id")
    .eq("client_id", clientId)
    .limit(1)
    .single();

  if (accountError || !account) throw new Error(accountError?.message ?? "Kein Meta Ad Account fuer diesen Partner gefunden.");

  const since = dateYearsAgo(2);
  const until = today();
  const ranges = chunkDateRange({ since, until });

  const { data: job, error: jobError } = await supabase
    .from("meta_backfill_jobs")
    .insert({
      client_id: clientId,
      ad_account_id: account.id,
      status: "pending",
      since,
      until,
      total_chunks: ranges.length,
      payload: { chunkDays: getOptionalEnv("META_BACKFILL_CHUNK_DAYS", getOptionalEnv("META_SYNC_INSIGHT_CHUNK_DAYS", "30")) }
    })
    .select("id")
    .single();

  if (jobError || !job) throw new Error(jobError?.message ?? "Meta Backfill Job konnte nicht erstellt werden.");

  const { error: chunkError } = await supabase.from("meta_backfill_chunks").insert(
    ranges.map((range, index) => ({
      job_id: job.id,
      client_id: clientId,
      ad_account_id: account.id,
      chunk_index: index,
      since: range.since,
      until: range.until,
      status: "pending"
    }))
  );

  if (chunkError) throw new Error(chunkError.message);
  return getLatestMetaBackfillStatus(clientId);
}

export async function processNextMetaBackfillChunk(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: job, error: jobError } = await supabase
    .from("meta_backfill_jobs")
    .select("id,client_id,ad_account_id,status,since,until,total_chunks,completed_chunks,failed_chunks,total_insights,pause_until,error_message,started_at,finished_at,created_at")
    .eq("client_id", clientId)
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return { status: await getLatestMetaBackfillStatus(clientId), processed: false };

  const typedJob = job as BackfillJobRow;
  await resetStaleRunningChunks(typedJob.id);

  if (typedJob.pause_until && new Date(typedJob.pause_until).getTime() > Date.now()) {
    return { status: await getLatestMetaBackfillStatus(clientId), processed: false };
  }

  const { data: chunk, error: chunkError } = await supabase
    .from("meta_backfill_chunks")
    .select("id,job_id,chunk_index,since,until,status,attempts,insights,error_message,run_after")
    .eq("job_id", typedJob.id)
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("chunk_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (chunkError) throw new Error(chunkError.message);

  if (!chunk) {
    await syncJobProgress(typedJob);
    return { status: await getLatestMetaBackfillStatus(clientId), processed: false };
  }

  const typedChunk = chunk as BackfillChunkRow;
  await supabase
    .from("meta_backfill_jobs")
    .update({ status: "running", started_at: typedJob.started_at ?? new Date().toISOString(), pause_until: null, error_message: null })
    .eq("id", typedJob.id);
  await supabase
    .from("meta_backfill_chunks")
    .update({ status: "running", attempts: typedChunk.attempts + 1, started_at: new Date().toISOString(), error_message: null })
    .eq("id", typedChunk.id);

  try {
    const summary = typedChunk.chunk_index === 0
      ? await syncMetaForClient(clientId, { since: typedChunk.since, until: typedChunk.until })
      : await syncMetaInsightsForClient(clientId, { since: typedChunk.since, until: typedChunk.until });
    const insights = Number(summary.insights ?? 0);

    await supabase
      .from("meta_backfill_chunks")
      .update({ status: "completed", insights, finished_at: new Date().toISOString(), error_message: null })
      .eq("id", typedChunk.id);
    await syncJobProgress(typedJob);

    return { status: await getLatestMetaBackfillStatus(clientId), processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta Backfill Chunk fehlgeschlagen.";
    if (isRateLimitError(error)) {
      const pauseUntil = rateLimitPauseDate();
      await supabase
        .from("meta_backfill_chunks")
        .update({ status: "pending", error_message: message, run_after: pauseUntil })
        .eq("id", typedChunk.id);
      await supabase
        .from("meta_backfill_jobs")
        .update({ status: "paused", pause_until: pauseUntil, error_message: message })
        .eq("id", typedJob.id);
      await syncJobProgress(typedJob);
      return { status: await getLatestMetaBackfillStatus(clientId), processed: false };
    }

    const attempts = typedChunk.attempts + 1;
    const maxAttempts = Number(getOptionalEnv("META_BACKFILL_MAX_CHUNK_ATTEMPTS", "3"));
    if (attempts < Math.max(1, Number.isFinite(maxAttempts) ? maxAttempts : 3)) {
      await supabase
        .from("meta_backfill_chunks")
        .update({ status: "pending", error_message: message, run_after: retryDate(attempts) })
        .eq("id", typedChunk.id);
    } else {
      await supabase
        .from("meta_backfill_chunks")
        .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
        .eq("id", typedChunk.id);
      await supabase
        .from("meta_backfill_jobs")
        .update({ failed_chunks: typedJob.failed_chunks + 1, error_message: message })
        .eq("id", typedJob.id);
    }

    await syncJobProgress(typedJob);

    return { status: await getLatestMetaBackfillStatus(clientId), processed: false };
  }
}
