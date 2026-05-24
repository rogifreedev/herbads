import { NextResponse } from "next/server";
import { analyzeCreative } from "@/lib/creative-ai";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string; creativeId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId, creativeId } = await context.params;
    const analysis = await analyzeCreative(clientId, creativeId);
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Creative konnte nicht analysiert werden." },
      { status: 400 }
    );
  }
}
