import { NextResponse } from "next/server";
import { getAdIdeasOverview } from "@/lib/ad-ideas";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const overview = await getAdIdeasOverview(clientId);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ad Ideas konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
