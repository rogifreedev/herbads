import { NextResponse } from "next/server";
import { getLatestMetaBackfillStatus, startMetaBackfill } from "@/lib/meta/backfill";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const status = await getLatestMetaBackfillStatus(clientId);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta Backfill Status konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const status = await startMetaBackfill(clientId);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta Backfill konnte nicht gestartet werden." },
      { status: 400 }
    );
  }
}
