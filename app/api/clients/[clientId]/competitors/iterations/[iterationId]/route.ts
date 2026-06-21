import { NextResponse } from "next/server";
import { updateCompetitorIterationStatus } from "@/lib/competitor-iterations";

type RouteContext = {
  params: Promise<{ clientId: string; iterationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { clientId, iterationId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { status?: unknown };
    const overview = await updateCompetitorIterationStatus(clientId, iterationId, typeof body.status === "string" ? body.status : "");
    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Competitor Iteration Status konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
