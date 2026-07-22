import { NextResponse } from "next/server";
import { syncMetaCommentsForClient } from "@/lib/meta-comments";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    return NextResponse.json(await syncMetaCommentsForClient(clientId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kommentare konnten nicht synchronisiert werden." },
      { status: 400 }
    );
  }
}
