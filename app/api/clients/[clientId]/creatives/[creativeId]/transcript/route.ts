import { NextResponse } from "next/server";
import { transcribeCreativeVideo } from "@/lib/video-transcripts";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ clientId: string; creativeId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId, creativeId } = await context.params;
    const transcript = await transcribeCreativeVideo(clientId, creativeId);
    return NextResponse.json({ transcript });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Video konnte nicht transkribiert werden." },
      { status: 400 }
    );
  }
}
