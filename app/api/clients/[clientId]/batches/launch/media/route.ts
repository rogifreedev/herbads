import { NextResponse } from "next/server";
import { getBatchLaunchMedia } from "@/lib/batch-launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const folderId = new URL(request.url).searchParams.get("folderId") ?? "";
    return NextResponse.json(await getBatchLaunchMedia(clientId, folderId), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch-Medien konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
