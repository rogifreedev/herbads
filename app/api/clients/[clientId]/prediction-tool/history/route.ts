import { NextResponse } from "next/server";
import { listCreativePredictionAnalyses } from "@/lib/prediction-history";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function normalizeFormat(value: string | null) {
  if (value === "static" || value === "video") return value;
  return "all";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const { searchParams } = new URL(request.url);
    const { analyses, error } = await listCreativePredictionAnalyses(clientId, normalizeFormat(searchParams.get("format")));
    if (error) throw new Error(error);
    return NextResponse.json({ analyses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prediction History konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}
