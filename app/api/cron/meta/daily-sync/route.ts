import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { DEFAULT_META_DAILY_LOOKBACK_DAYS, getMetaDailySyncRange } from "@/lib/meta/daily-sync";
import { syncMetaForClient } from "@/lib/meta/sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type MetaAdAccountRow = {
  client_id: string;
  status: string;
  last_synced_at: string | null;
  clients?: { status?: string | null } | null;
};

function assertCronAuth(request: Request) {
  const secret = getOptionalEnv("CRON_SECRET");
  if (!secret) throw new Error("CRON_SECRET fehlt.");

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  if (authorization !== `Bearer ${secret}` && headerSecret !== secret) {
    throw new Error("Nicht autorisiert.");
  }
}

function dailySyncRange() {
  const configuredDays = Number(
    getOptionalEnv("META_DAILY_SYNC_LOOKBACK_DAYS", String(DEFAULT_META_DAILY_LOOKBACK_DAYS))
  );
  return getMetaDailySyncRange(new Date(), configuredDays);
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /rate limit|request limit|too many calls|calls to this api|temporarily blocked/i.test(message);
}

export async function POST(request: Request) {
  try {
    assertCronAuth(request);

    const supabase = createSupabaseServiceRoleClient();
    const { data: accounts, error } = await supabase
      .from("meta_ad_accounts")
      .select("client_id,status,last_synced_at,clients(status)");

    if (error) throw new Error(error.message);

    const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from("sync_jobs")
      .update({
        status: "failed",
        error_message: "Sync-Job wurde nach einem Server-Timeout automatisch beendet.",
        finished_at: new Date().toISOString()
      })
      .eq("status", "running")
      .lt("started_at", staleCutoff);

    const clientIds = Array.from(
      new Set(
        ((accounts ?? []) as MetaAdAccountRow[])
          .filter(
            (account) =>
              account.clients?.status === "active" &&
              (account.status === "active" || account.status === "1")
          )
          .sort((left, right) => {
            const leftTime = left.last_synced_at ? new Date(left.last_synced_at).getTime() : 0;
            const rightTime = right.last_synced_at ? new Date(right.last_synced_at).getTime() : 0;
            return leftTime - rightTime;
          })
          .map((account) => account.client_id)
      )
    );
    const range = dailySyncRange();
    const results: Array<{ clientId: string; status: string; insights?: number; error?: string }> = [];
    const configuredConcurrency = Number(getOptionalEnv("META_DAILY_SYNC_CONCURRENCY", "2"));
    const concurrency = Math.min(
      clientIds.length,
      Math.max(1, Math.floor(Number.isFinite(configuredConcurrency) ? configuredConcurrency : 2))
    );
    let nextIndex = 0;
    let rateLimited = false;

    async function worker() {
      while (!rateLimited) {
        const index = nextIndex;
        nextIndex += 1;
        const clientId = clientIds[index];
        if (!clientId) return;

        try {
          const summary = await syncMetaForClient(clientId, {
            ...range,
            includeBreakdowns: false,
            jobType: "cron_meta_daily_sync"
          });
          results.push({ clientId, status: "completed", insights: Number(summary.insights ?? 0) });
        } catch (syncError) {
          const message = syncError instanceof Error ? syncError.message : "Meta Daily Sync fehlgeschlagen.";
          const status = isRateLimitError(syncError) ? "paused_rate_limit" : "failed";
          results.push({ clientId, status, error: message });
          if (status === "paused_rate_limit") rateLimited = true;
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    for (const clientId of clientIds.slice(nextIndex)) {
      results.push({ clientId, status: "skipped_rate_limit" });
    }

    return NextResponse.json({ range, clients: clientIds.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta Daily Sync konnte nicht ausgefuehrt werden.";
    return NextResponse.json({ error: message }, { status: message === "Nicht autorisiert." ? 401 : 400 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
