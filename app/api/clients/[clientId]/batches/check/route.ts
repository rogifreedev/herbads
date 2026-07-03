import { NextResponse } from "next/server";
import { runBatchCheck } from "@/lib/batches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const overview = await runBatchCheck(clientId);
    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Batch Check fehlgeschlagen." }, { status: 400 });
  }
}
