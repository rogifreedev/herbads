import { NextResponse } from "next/server";
import { getAdIterationsOverview } from "@/lib/creative-iterations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const overview = await getAdIterationsOverview(clientId);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Iterations konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
