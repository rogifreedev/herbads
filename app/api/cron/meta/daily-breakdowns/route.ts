import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { DEFAULT_META_DAILY_LOOKBACK_DAYS, getMetaDailySyncRange } from "@/lib/meta/daily-sync";
import { syncMetaBreakdownsForClient } from "@/lib/meta/sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type MetaAdAccountRow = {
  client_id: string;
  status: string;
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
    getOptionalEnv("META_DEMOGRAPHIC_LOOKBACK_DAYS", String(DEFAULT_META_DAILY_LOOKBACK_DAYS))
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
      .select("client_id,status,clients(status)");

    if (error) throw new Error(error.message);

    const clientIds = Array.from(
      new Set(
        ((accounts ?? []) as MetaAdAccountRow[])
          .filter(
            (account) =>
              account.clients?.status === "active" &&
              (account.status === "active" || account.status === "1")
          )
          .map((account) => account.client_id)
      )
    );
    const range = dailySyncRange();
    const results: Array<{
      clientId: string;
      status: string;
      breakdownInsights?: number;
      error?: string;
    }> = [];
    const configuredConcurrency = Number(getOptionalEnv("META_DEMOGRAPHIC_SYNC_CONCURRENCY", "2"));
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
          const summary = await syncMetaBreakdownsForClient(clientId, {
            ...range,
            jobType: "cron_meta_daily_breakdown_sync"
          });
          const status = summary.breakdownErrorCount > 0 ? "failed" : "completed";
          results.push({
            clientId,
            status,
            breakdownInsights: Number(summary.breakdownInsights ?? 0),
            error: status === "failed"
              ? summary.breakdownErrors.map((item) => `${item.breakdown}: ${item.error}`).join("; ")
              : undefined
          });
        } catch (syncError) {
          const message = syncError instanceof Error ? syncError.message : "Meta Demografie Sync fehlgeschlagen.";
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
    const message = error instanceof Error ? error.message : "Meta Demografie Sync konnte nicht ausgefuehrt werden.";
    return NextResponse.json({ error: message }, { status: message === "Nicht autorisiert." ? 401 : 400 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
