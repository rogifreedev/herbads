import { NextResponse } from "next/server";
import { generateAdIterations, type GenerateIterationFormat } from "@/lib/creative-iterations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function dateParam(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function formatParam(value: unknown): GenerateIterationFormat {
  return value === "static" || value === "video" || value === "all" ? value : "all";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await generateAdIterations(clientId, {
      format: formatParam(body.format),
      count: Number(body.count) || 6,
      since: dateParam(body.since),
      until: dateParam(body.until),
      mode: "manual"
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Iterations konnten nicht generiert werden." },
      { status: 400 }
    );
  }
}
