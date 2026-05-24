import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { syncMetaInsightsForClient } from "@/lib/meta/sync";
import { getLatestMetaBackfillStatus } from "@/lib/meta/backfill";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MetaAdAccountRow = {
  client_id: string;
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

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dailySyncRange() {
  const configuredDays = Number(getOptionalEnv("META_DAILY_SYNC_LOOKBACK_DAYS", "7"));
  const days = Math.max(1, Math.floor(Number.isFinite(configuredDays) ? configuredDays : 7));
  const untilDate = new Date();
  untilDate.setUTCDate(untilDate.getUTCDate() - 1);

  const sinceDate = new Date(untilDate);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - days + 1);

  return { since: formatDateInput(sinceDate), until: formatDateInput(untilDate) };
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
      .select("client_id,clients(status)")
      .eq("status", "active");

    if (error) throw new Error(error.message);

    const clientIds = Array.from(
      new Set(
        ((accounts ?? []) as MetaAdAccountRow[])
          .filter((account) => account.clients?.status !== "archived")
          .map((account) => account.client_id)
      )
    );
    const range = dailySyncRange();
    const results: Array<{ clientId: string; status: string; insights?: number; error?: string }> = [];

    for (const clientId of clientIds) {
      const backfill = await getLatestMetaBackfillStatus(clientId);
      if (backfill?.status !== "completed") {
        results.push({ clientId, status: "skipped_backfill_not_completed" });
        continue;
      }

      try {
        const summary = await syncMetaInsightsForClient(clientId, range);
        results.push({ clientId, status: "completed", insights: Number(summary.insights ?? 0) });
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : "Meta Daily Sync fehlgeschlagen.";
        results.push({ clientId, status: isRateLimitError(syncError) ? "paused_rate_limit" : "failed", error: message });
        if (isRateLimitError(syncError)) break;
      }
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
