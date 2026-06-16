import { NextResponse } from "next/server";
import { processNextCompetitorCreativeAnalysisItems } from "@/lib/competitor-analysis-jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const result = await processNextCompetitorCreativeAnalysisItems(clientId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Bulk Analyse konnte nicht verarbeitet werden." }, { status: 400 });
  }
}
