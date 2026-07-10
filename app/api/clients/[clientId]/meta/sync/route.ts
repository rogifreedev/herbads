import { NextResponse } from "next/server";
import { syncMetaForClient, syncMetaInsightsForClient } from "@/lib/meta/sync";

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    let body: { since?: unknown; until?: unknown; insightsOnly?: unknown } = {};
    try {
      body = (await request.json()) as { since?: unknown; until?: unknown; insightsOnly?: unknown };
    } catch {
      body = {};
    }

    const sync = body.insightsOnly === true ? syncMetaInsightsForClient : syncMetaForClient;
    const summary = await sync(clientId, {
      since: typeof body.since === "string" ? body.since : null,
      until: typeof body.until === "string" ? body.until : null
    });
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta Sync konnte nicht ausgefuehrt werden." },
      { status: 400 }
    );
  }
}
