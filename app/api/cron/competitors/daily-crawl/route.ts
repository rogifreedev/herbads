import { NextResponse } from "next/server";
import { revalidateCacheTags, CACHE_TAGS } from "@/lib/cache-tags";
import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ACTIVE_JOB_STATUSES = ["pending", "running", "retry"];

type SourceRow = {
  id: string;
  client_id: string;
  competitor_id: string | null;
  url: string;
  competitors: { crawl_enabled?: boolean | null } | Array<{ crawl_enabled?: boolean | null }> | null;
  clients: { status?: string | null } | Array<{ status?: string | null }> | null;
};

function relationValue<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function assertCronAuth(request: Request) {
  const secret = getOptionalEnv("CRON_SECRET");
  if (!secret) throw new Error("CRON_SECRET fehlt.");
  if (request.headers.get("authorization") !== `Bearer ${secret}` && request.headers.get("x-cron-secret") !== secret) {
    throw new Error("Nicht autorisiert.");
  }
}

function utcDayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("competitor_ad_library_sources")
      .select("id,client_id,competitor_id,url,competitors(crawl_enabled),clients(status)");
    if (error) throw new Error(error.message);

    const sources = ((data ?? []) as SourceRow[]).filter((source) =>
      relationValue(source.competitors)?.crawl_enabled !== false && relationValue(source.clients)?.status === "active"
    );
    if (!sources.length) return NextResponse.json({ sources: 0, queued: 0, skipped: 0 });

    const sourceIds = sources.map((source) => source.id);
    const [{ data: activeJobs, error: activeError }, { data: todaysJobs, error: todayError }] = await Promise.all([
      supabase.from("competitor_crawl_jobs").select("source_id").in("source_id", sourceIds).in("status", ACTIVE_JOB_STATUSES),
      supabase.from("competitor_crawl_jobs").select("source_id").in("source_id", sourceIds).gte("created_at", utcDayStart())
    ]);
    if (activeError || todayError) throw new Error(activeError?.message ?? todayError?.message);

    const alreadyQueued = new Set([...(activeJobs ?? []), ...(todaysJobs ?? [])].map((job) => job.source_id));
    const eligible = sources.filter((source) => !alreadyQueued.has(source.id));
    const maxAttemptsValue = Number(getOptionalEnv("COMPETITOR_CRAWL_JOB_MAX_ATTEMPTS", "3"));
    const maxAttempts = Math.max(1, Math.floor(Number.isFinite(maxAttemptsValue) ? maxAttemptsValue : 3));

    if (eligible.length) {
      const now = new Date().toISOString();
      const { error: insertError } = await supabase.from("competitor_crawl_jobs").insert(eligible.map((source) => ({
        client_id: source.client_id,
        source_id: source.id,
        competitor_id: source.competitor_id,
        status: "pending",
        max_attempts: maxAttempts,
        run_after: now,
        raw: { sourceUrl: source.url, trigger: "daily_cron" }
      })));
      if (insertError) throw new Error(insertError.message);

      const { error: sourceError } = await supabase
        .from("competitor_ad_library_sources")
        .update({ status: "pending", error_message: null })
        .in("id", eligible.map((source) => source.id));
      if (sourceError) throw new Error(sourceError.message);
      revalidateCacheTags(CACHE_TAGS.competitors);
    }

    return NextResponse.json({ sources: sources.length, queued: eligible.length, skipped: sources.length - eligible.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily Competitor Crawl konnte nicht eingeplant werden.";
    return NextResponse.json({ error: message }, { status: message === "Nicht autorisiert." ? 401 : 400 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
