import { NextResponse } from "next/server";
import { updateAdIdeaStatus } from "@/lib/ad-ideas";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string; ideaId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { clientId, ideaId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const status = typeof body.status === "string" ? body.status : "";
    const overview = await updateAdIdeaStatus(clientId, ideaId, status);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ad Idea konnte nicht aktualisiert werden." },
      { status: 400 }
    );
  }
}
