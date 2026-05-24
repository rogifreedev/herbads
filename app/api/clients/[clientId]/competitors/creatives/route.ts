import { NextResponse } from "next/server";
import { createCompetitorCreative } from "@/lib/competitors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function optionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const overview = await createCompetitorCreative(clientId, {
      competitorId: typeof body.competitorId === "string" ? body.competitorId : null,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      adLibraryId: typeof body.adLibraryId === "string" ? body.adLibraryId : null,
      status: typeof body.status === "string" ? body.status : null,
      format: typeof body.format === "string" ? body.format : null,
      platforms: Array.isArray(body.platforms) ? body.platforms.filter((item: unknown): item is string => typeof item === "string") : [],
      startedAt: typeof body.startedAt === "string" ? body.startedAt : null,
      endedAt: typeof body.endedAt === "string" ? body.endedAt : null,
      reachMin: optionalNumber(body.reachMin),
      reachMax: optionalNumber(body.reachMax),
      thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null,
      videoUrl: typeof body.videoUrl === "string" ? body.videoUrl : null,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
      landingUrl: typeof body.landingUrl === "string" ? body.landingUrl : null,
      primaryText: typeof body.primaryText === "string" ? body.primaryText : null,
      headline: typeof body.headline === "string" ? body.headline : null,
      hook: typeof body.hook === "string" ? body.hook : null,
      cta: typeof body.cta === "string" ? body.cta : null
    });
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Creative konnte nicht gespeichert werden." }, { status: 400 });
  }
}
