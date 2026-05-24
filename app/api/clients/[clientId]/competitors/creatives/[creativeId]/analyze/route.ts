import { NextResponse } from "next/server";
import { analyzeCompetitorCreative } from "@/lib/competitors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string; creativeId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId, creativeId } = await context.params;
    const overview = await analyzeCompetitorCreative(clientId, creativeId);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor Creative konnte nicht analysiert werden." }, { status: 400 });
  }
}
