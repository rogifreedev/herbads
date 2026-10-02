import { NextResponse } from "next/server";
import { refreshBatchMetaStatuses } from "@/lib/batch-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ clientId: string }> }) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  try {
    const { clientId } = await context.params;
    return NextResponse.json(await refreshBatchMetaStatuses(clientId), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Meta-Status konnte nicht aktualisiert werden." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
