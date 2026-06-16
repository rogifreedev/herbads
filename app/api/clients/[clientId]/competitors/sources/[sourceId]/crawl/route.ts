import { NextResponse } from "next/server";
import { enqueueCompetitorCrawlJob } from "@/lib/competitor-crawl-jobs";
import { crawlCompetitorSource } from "@/lib/competitors";
import { getOptionalEnv } from "@/lib/env";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string; sourceId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId, sourceId } = await context.params;
    if (getOptionalEnv("COMPETITOR_CRAWL_MODE", "worker") !== "inline") {
      const result = await enqueueCompetitorCrawlJob(clientId, sourceId);
      return NextResponse.json(result);
    }

    const overview = await crawlCompetitorSource(clientId, sourceId);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Source Crawl fehlgeschlagen." }, { status: 400 });
  }
}
