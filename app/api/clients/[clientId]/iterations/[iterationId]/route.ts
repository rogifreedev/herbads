import { NextResponse } from "next/server";
import { updateAdIterationStatus } from "@/lib/creative-iterations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string; iterationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { clientId, iterationId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const status = typeof body.status === "string" ? body.status : "";
    const overview = await updateAdIterationStatus(clientId, iterationId, status);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Iteration konnte nicht aktualisiert werden." },
      { status: 400 }
    );
  }
}
