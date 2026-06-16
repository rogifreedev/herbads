import { NextResponse } from "next/server";
import { updateCompetitorCrawlSettings } from "@/lib/competitors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string; competitorId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { clientId, competitorId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const overview = await updateCompetitorCrawlSettings(clientId, competitorId, {
      crawlEnabled: Boolean(body.crawlEnabled)
    });
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Settings konnten nicht gespeichert werden." }, { status: 400 });
  }
}
