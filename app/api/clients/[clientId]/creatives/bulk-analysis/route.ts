import { NextResponse } from "next/server";
import { getLatestCreativeAnalysisJobStatus, startCreativeAnalysisJob } from "@/lib/creative-analysis-jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const status = await getLatestCreativeAnalysisJobStatus(clientId);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI Bulk-Analyse Status konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const creativeIds = Array.isArray(body.creativeIds) ? body.creativeIds.filter((value: unknown): value is string => typeof value === "string") : [];
    const status = await startCreativeAnalysisJob(clientId, creativeIds);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI Bulk-Analyse konnte nicht gestartet werden." },
      { status: 400 }
    );
  }
}
