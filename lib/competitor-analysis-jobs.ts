import "server-only";

import { getOptionalEnv } from "@/lib/env";
import { analyzeCompetitorCreative } from "@/lib/competitors";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const ACTIVE_JOB_STATUSES = ["pending", "running", "paused"];
const DEFAULT_RETRY_MINUTES = 5;

type CompetitorCreativeAnalysisJobRow = {
  id: string;
  client_id: string;
  status: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  pause_until: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type CompetitorCreativeAnalysisJobItemRow = {
  id: string;
  job_id: string;
  client_id: string;
  competitor_creative_id: string;
  item_index: number;
  status: string;
  attempts: number;
  analysis_id: string | null;
  error_message: string | null;
  run_after: string | null;
};

function retryDate(attempts: number) {
  const minutes = Math.min(30, Math.max(DEFAULT_RETRY_MINUTES, attempts * DEFAULT_RETRY_MINUTES));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function staleRunningCutoffDate() {
  const minutesValue = Number(getOptionalEnv("COMPETITOR_CREATIVE_ANALYSIS_JOB_STALE_RUNNING_MINUTES", "15"));
  const minutes = Math.max(5, Math.floor(Number.isFinite(minutesValue) ? minutesValue : 15));
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function maxAttempts() {
  const value = Number(getOptionalEnv("COMPETITOR_CREATIVE_ANALYSIS_JOB_MAX_ATTEMPTS", "3"));
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 3));
}

function batchSize() {
  const value = Number(getOptionalEnv("COMPETITOR_CREATIVE_ANALYSIS_JOB_BATCH_SIZE", "1"));
  return Math.max(1, Math.min(5, Math.floor(Number.isFinite(value) ? value : 1)));
}

function mapJob(job: CompetitorCreativeAnalysisJobRow | null, items?: CompetitorCreativeAnalysisJobItemRow[]) {
  if (!job) return null;

  const completedItems = items ? items.filter((item) => item.status === "completed").length : job.completed_items;
  const failedItems = items ? items.filter((item) => item.status === "failed").length : job.failed_items;
  const totalItems = items ? items.length : job.total_items;
  const activeItem = items?.find((item) => item.status === "running" || item.status === "pending") ?? null;
  const percent = totalItems > 0 ? Math.round(((completedItems + failedItems) / totalItems) * 100) : 0;

  return {
    id: job.id,
    status: job.status,
    totalItems,
    completedItems,
    failedItems,
    processedItems: completedItems + failedItems,
    percent,
    pauseUntil: job.pause_until,
    errorMessage: job.error_message,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    createdAt: job.created_at,
    activeItem: activeItem
      ? {
          creativeId: activeItem.competitor_creative_id,
          index: activeItem.item_index,
          status: activeItem.status,
          attempts: activeItem.attempts,
          errorMessage: activeItem.error_message
        }
      : null
  };
}

async function resetStaleRunningItems(jobId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("competitor_creative_analysis_job_items")
    .update({ status: "pending", run_after: new Date().toISOString(), error_message: "Running Analyse nach Timeout erneut eingeplant." })
    .eq("job_id", jobId)
    .eq("status", "running")
    .lte("started_at", staleRunningCutoffDate());

  if (error) throw new Error(error.message);
}

async function syncJobProgress(job: CompetitorCreativeAnalysisJobRow) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: items, error } = await supabase
    .from("competitor_creative_analysis_job_items")
    .select("id,job_id,client_id,competitor_creative_id,item_index,status,attempts,analysis_id,error_message,run_after")
    .eq("job_id", job.id)
    .order("item_index", { ascending: true });

  if (error) throw new Error(error.message);

  const typedItems = (items ?? []) as CompetitorCreativeAnalysisJobItemRow[];
  const completedItems = typedItems.filter((item) => item.status === "completed").length;
  const failedItems = typedItems.filter((item) => item.status === "failed").length;
  const pendingItems = typedItems.filter((item) => item.status === "pending");
  const runningItems = typedItems.filter((item) => item.status === "running");
  const unfinishedItems = pendingItems.length + runningItems.length;
  const nextRunAfter = pendingItems
    .map((item) => item.run_after)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const shouldPause = unfinishedItems > 0 && Boolean(nextRunAfter) && new Date(nextRunAfter).getTime() > Date.now();
  const status = unfinishedItems > 0 ? (shouldPause ? "paused" : "running") : failedItems > 0 ? "failed" : "completed";

  const { error: updateError } = await supabase
    .from("competitor_creative_analysis_jobs")
    .update({
      status,
      completed_items: completedItems,
      failed_items: failedItems,
      pause_until: status === "paused" ? nextRunAfter : null,
      finished_at: status === "completed" || status === "failed" ? new Date().toISOString() : null
    })
    .eq("id", job.id);

  if (updateError) throw new Error(updateError.message);
}

export async function getLatestCompetitorCreativeAnalysisJobStatus(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: job, error: jobError } = await supabase
    .from("competitor_creative_analysis_jobs")
    .select("id,client_id,status,total_items,completed_items,failed_items,pause_until,error_message,started_at,finished_at,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) return null;

  const { data: items, error: itemsError } = await supabase
    .from("competitor_creative_analysis_job_items")
    .select("id,job_id,client_id,competitor_creative_id,item_index,status,attempts,analysis_id,error_message,run_after")
    .eq("job_id", job.id)
    .order("item_index", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);
  return mapJob(job as CompetitorCreativeAnalysisJobRow, (items ?? []) as CompetitorCreativeAnalysisJobItemRow[]);
}

export async function startCompetitorCreativeAnalysisJob(clientId: string, creativeIds: string[]) {
  const supabase = createSupabaseServiceRoleClient();
  const uniqueCreativeIds = Array.from(new Set(creativeIds.filter(Boolean)));
  if (uniqueCreativeIds.length === 0) throw new Error("Keine Competitor Creatives fuer die Analyse ausgewaehlt.");

  const { data: existing, error: existingError } = await supabase
    .from("competitor_creative_analysis_jobs")
    .select("id,client_id,status,total_items,completed_items,failed_items,pause_until,error_message,started_at,finished_at,created_at")
    .eq("client_id", clientId)
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return getLatestCompetitorCreativeAnalysisJobStatus(clientId);

  const { data: validCreatives, error: creativesError } = await supabase
    .from("competitor_creatives")
    .select("id")
    .eq("client_id", clientId)
    .in("id", uniqueCreativeIds);

  if (creativesError) throw new Error(creativesError.message);
  const validIds = uniqueCreativeIds.filter((creativeId) => (validCreatives ?? []).some((creative) => creative.id === creativeId));
  if (validIds.length === 0) throw new Error("Keine gueltigen Competitor Creatives fuer diesen Kunden gefunden.");

  const { data: job, error: jobError } = await supabase
    .from("competitor_creative_analysis_jobs")
    .insert({ client_id: clientId, status: "pending", total_items: validIds.length, payload: { source: "competitor-creatives" } })
    .select("id")
    .single();

  if (jobError || !job) throw new Error(jobError?.message ?? "Competitor Analyse-Job konnte nicht erstellt werden.");

  const { error: itemError } = await supabase.from("competitor_creative_analysis_job_items").insert(
    validIds.map((creativeId, index) => ({
      job_id: job.id,
      client_id: clientId,
      competitor_creative_id: creativeId,
      item_index: index,
      status: "pending"
    }))
  );

  if (itemError) throw new Error(itemError.message);
  return getLatestCompetitorCreativeAnalysisJobStatus(clientId);
}

async function getNextActiveJob(clientId?: string) {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase
    .from("competitor_creative_analysis_jobs")
    .select("id,client_id,status,total_items,completed_items,failed_items,pause_until,error_message,started_at,finished_at,created_at")
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: true })
    .limit(1);

  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as CompetitorCreativeAnalysisJobRow | null;
}

async function getLatestAnalysisId(clientId: string, creativeId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("competitor_creative_analyses")
    .select("id")
    .eq("client_id", clientId)
    .eq("competitor_creative_id", creativeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function processNextCompetitorCreativeAnalysisItems(clientId?: string) {
  const supabase = createSupabaseServiceRoleClient();
  const job = await getNextActiveJob(clientId);
  if (!job) return { status: clientId ? await getLatestCompetitorCreativeAnalysisJobStatus(clientId) : null, processed: 0 };

  await resetStaleRunningItems(job.id);

  if (job.pause_until && new Date(job.pause_until).getTime() > Date.now()) {
    return { status: await getLatestCompetitorCreativeAnalysisJobStatus(job.client_id), processed: 0 };
  }

  const { data: items, error: itemError } = await supabase
    .from("competitor_creative_analysis_job_items")
    .select("id,job_id,client_id,competitor_creative_id,item_index,status,attempts,analysis_id,error_message,run_after")
    .eq("job_id", job.id)
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("item_index", { ascending: true })
    .limit(batchSize());

  if (itemError) throw new Error(itemError.message);

  const pendingItems = (items ?? []) as CompetitorCreativeAnalysisJobItemRow[];
  if (pendingItems.length === 0) {
    await syncJobProgress(job);
    return { status: await getLatestCompetitorCreativeAnalysisJobStatus(job.client_id), processed: 0 };
  }

  await supabase
    .from("competitor_creative_analysis_jobs")
    .update({ status: "running", started_at: job.started_at ?? new Date().toISOString(), pause_until: null, error_message: null })
    .eq("id", job.id);

  let processed = 0;
  for (const item of pendingItems) {
    await supabase
      .from("competitor_creative_analysis_job_items")
      .update({ status: "running", attempts: item.attempts + 1, started_at: new Date().toISOString(), error_message: null })
      .eq("id", item.id);

    try {
      await analyzeCompetitorCreative(job.client_id, item.competitor_creative_id);
      const analysisId = await getLatestAnalysisId(job.client_id, item.competitor_creative_id);
      await supabase
        .from("competitor_creative_analysis_job_items")
        .update({ status: "completed", analysis_id: analysisId, finished_at: new Date().toISOString(), error_message: null })
        .eq("id", item.id);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Competitor Analyse fehlgeschlagen.";
      const attempts = item.attempts + 1;
      if (attempts < maxAttempts()) {
        await supabase
          .from("competitor_creative_analysis_job_items")
          .update({ status: "pending", error_message: message, run_after: retryDate(attempts) })
          .eq("id", item.id);
      } else {
        await supabase
          .from("competitor_creative_analysis_job_items")
          .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
          .eq("id", item.id);
      }
    }
  }

  await syncJobProgress(job);
  return { status: await getLatestCompetitorCreativeAnalysisJobStatus(job.client_id), processed };
}
