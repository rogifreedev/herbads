import { NextResponse } from "next/server";
import { getBatchLaunchIdentities } from "@/lib/batch-launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const params = new URL(request.url).searchParams;
    const accountId = params.get("accountId") ?? "";
    return NextResponse.json(await getBatchLaunchIdentities(clientId, accountId, params.get("refresh") === "1"), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Facebook- und Instagram-Auswahl konnte nicht geladen werden."
      },
      { status: 400 }
    );
  }
}
