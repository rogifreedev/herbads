import { NextResponse } from "next/server";
import { getBatchLaunchOptions } from "@/lib/batch-launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const accountId = new URL(request.url).searchParams.get("accountId") ?? "";
    return NextResponse.json(await getBatchLaunchOptions(clientId, accountId), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta-Einstellungen konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
