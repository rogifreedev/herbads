import { NextResponse } from "next/server";
import { getCompetitorIterationsOverview } from "@/lib/competitor-iterations";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const overview = await getCompetitorIterationsOverview(clientId);
    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Competitor Iterations konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
