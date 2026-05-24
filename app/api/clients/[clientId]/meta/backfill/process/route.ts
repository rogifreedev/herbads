import { NextResponse } from "next/server";
import { processNextMetaBackfillChunk } from "@/lib/meta/backfill";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const result = await processNextMetaBackfillChunk(clientId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta Backfill Worker konnte nicht ausgefuehrt werden." },
      { status: 400 }
    );
  }
}
