import { NextResponse } from "next/server";
import { crawlCompetitorSource } from "@/lib/competitors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string; sourceId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId, sourceId } = await context.params;
    const overview = await crawlCompetitorSource(clientId, sourceId);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Source Crawl fehlgeschlagen." }, { status: 400 });
  }
}
