import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { processBatchLaunch } from "@/lib/batch-launch-worker";
import { mapLaunchJob, type BatchLaunchJobRow } from "@/lib/batch-launch";
import type { BatchUploadOverview } from "@/lib/batch-launch-types";

export async function authorizeBatchUploadWorker(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) return false;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("authorize_batch_upload_worker", {
    p_secret: secret
  });
  return !error && data === true;
}

export async function processBatchUploadQueue() {
  const db = createSupabaseServiceRoleClient();
  const token = randomUUID();
  const { data, error } = await db.rpc("claim_batch_upload_queue", { p_token: token });
  if (error) throw new Error(error.message);
  if (!data) return { busy: true, steps: 0 };
  // A step can spend 30s in Drive and 35s in Meta. Leave room below the 120s route limit.
  const deadline = Date.now() + 30_000;
  let steps = 0;
  let failure: string | null = null;
  try {
    while (Date.now() < deadline && steps < 40) {
      const { data: job, error: readError } = await db
        .from("batch_launch_jobs")
        .select("id,client_id,lease_until")
        .eq("queue_enabled", true)
        .eq("control_status", "run")
        .in("status", ["pending", "running"])
        .order("queued_at")
        .order("id")
        .limit(1)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!job || (job.lease_until && Date.parse(job.lease_until) > Date.now())) break;
      const result = await processBatchLaunch(job.client_id, job.id, token);
      steps++;
      if (result.status === "running" && result.state.step === "processing") break;
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "Upload-Worker fehlgeschlagen.";
    throw error;
  } finally {
    const released = await db.rpc("release_batch_upload_queue", { p_token: token, p_error: failure });
    if (released.error) throw new Error(released.error.message);
  }
  return { busy: false, steps };
}

export async function controlBatchUpload(clientId: string, jobId: string, action: unknown) {
  if (!["pause", "resume", "cancel"].includes(String(action))) throw new Error("Ungueltige Upload-Aktion.");
  const { data, error } = await createSupabaseServiceRoleClient()
    .rpc("control_batch_upload", {
      p_client_id: clientId,
      p_job_id: jobId,
      p_action: action
    })
    .single();
  if (error) throw new Error(error.message);
  return mapLaunchJob(data as BatchLaunchJobRow);
}

export async function getBatchUploadOverview(params: URLSearchParams): Promise<BatchUploadOverview> {
  const db = createSupabaseServiceRoleClient();
  const page = Math.max(0, Math.min(10000, Math.trunc(Number(params.get("page")) || 0)));
  const clientId = params.get("clientId");
  if (clientId && !/^[a-f\d-]{36}$/i.test(clientId)) throw new Error("Ungueltiger Partner.");
  const status = params.get("status") || "active";
  const statuses: Record<string, string[]> = {
    active: ["pending", "running"],
    attention: ["paused", "failed", "review"],
    completed: ["completed", "cancelled"]
  };
  if (status !== "all" && !statuses[status]) throw new Error("Ungueltiger Status.");
  let query = db.from("batch_upload_overview").select("*", { count: "exact" });
  if (clientId) query = query.eq("client_id", clientId);
  if (statuses[status]) query = query.in("status", statuses[status]);
  query =
    status === "active"
      ? query.order("queued_at").order("id")
      : query.order("created_at", { ascending: false }).order("id");
  const [jobs, clients, runtime] = await Promise.all([
    query.range(page * 50, page * 50 + 49),
    db.from("clients").select("id,name").order("name"),
    db.from("batch_upload_runtime").select("enabled,scheduler_seen_at,heartbeat_at,last_error").single()
  ]);
  if (jobs.error || clients.error || runtime.error)
    throw new Error(jobs.error?.message ?? clients.error?.message ?? runtime.error?.message);
  return { jobs: jobs.data ?? [], total: jobs.count ?? 0, page, clients: clients.data ?? [], runtime: runtime.data };
}
