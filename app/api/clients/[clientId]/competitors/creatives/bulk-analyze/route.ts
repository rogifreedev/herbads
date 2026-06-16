import { NextResponse } from "next/server";
import { getLatestCompetitorCreativeAnalysisJobStatus, startCompetitorCreativeAnalysisJob } from "@/lib/competitor-analysis-jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const status = await getLatestCompetitorCreativeAnalysisJobStatus(clientId);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Bulk Analyse Status konnte nicht geladen werden." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const creativeIds = Array.isArray(body.creativeIds) ? body.creativeIds.filter((id: unknown): id is string => typeof id === "string") : [];
    const status = await startCompetitorCreativeAnalysisJob(clientId, creativeIds);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Bulk Analyse fehlgeschlagen." }, { status: 400 });
  }
}
