import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { getMetaAccountInsightsForClient, syncMetaForClient } from "@/lib/meta/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function assertCronAuth(request: Request) {
  const secret = getOptionalEnv("CRON_SECRET");
  if (!secret) throw new Error("CRON_SECRET fehlt.");

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  if (authorization !== `Bearer ${secret}` && headerSecret !== secret) {
    throw new Error("Nicht autorisiert.");
  }
}

export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    const body = await request.json() as { clientId?: unknown; since?: unknown; until?: unknown };
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const since = typeof body.since === "string" ? body.since.trim() : "";
    const until = typeof body.until === "string" ? body.until.trim() : "";

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
      throw new Error("Gueltige Client-ID fehlt.");
    }
    if (!since || !until) throw new Error("Sync-Zeitraum fehlt.");

    const summary = await syncMetaForClient(clientId, {
      since,
      until,
      includeBreakdowns: false,
      jobType: "cron_meta_targeted_sync"
    });
    const accountInsights = await getMetaAccountInsightsForClient(clientId, { since, until });
    return NextResponse.json({ summary, accountInsights });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gezielter Meta Sync konnte nicht ausgefuehrt werden.";
    return NextResponse.json({ error: message }, { status: message === "Nicht autorisiert." ? 401 : 400 });
  }
}
