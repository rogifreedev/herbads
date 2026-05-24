import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { processNextCreativeAnalysisItems } from "@/lib/creative-analysis-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertCronAuth(request: Request) {
  const secret = getOptionalEnv("CRON_SECRET");
  if (!secret) throw new Error("CRON_SECRET fehlt.");

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  if (authorization !== `Bearer ${secret}` && headerSecret !== secret) {
    throw new Error("Nicht autorisiert.");
  }
}

export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    const result = await processNextCreativeAnalysisItems();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI Bulk-Analyse Worker konnte nicht ausgefuehrt werden.";
    return NextResponse.json({ error: message }, { status: message === "Nicht autorisiert." ? 401 : 400 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
