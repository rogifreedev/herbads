import { NextResponse } from "next/server";
import { createCompetitorSource } from "@/lib/competitors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const overview = await createCompetitorSource(clientId, {
      competitorId: typeof body.competitorId === "string" ? body.competitorId : null,
      url: typeof body.url === "string" ? body.url : ""
    });
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Source konnte nicht gespeichert werden." }, { status: 400 });
  }
}
