import { NextResponse } from "next/server";
import { generateCompetitorIterations, type GenerateCompetitorIterationsOptions, type GenerateCompetitorIterationFormat } from "@/lib/competitor-iterations";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatValue(value: unknown): GenerateCompetitorIterationFormat {
  return value === "static" || value === "video" || value === "all" ? value : "all";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const options: GenerateCompetitorIterationsOptions = {
      format: formatValue(body.format),
      count: Number(body.count ?? 6),
      since: Object.prototype.hasOwnProperty.call(body, "since") ? stringOrNull(body.since) : undefined,
      until: Object.prototype.hasOwnProperty.call(body, "until") ? stringOrNull(body.until) : undefined,
      competitorId: stringOrNull(body.competitorId)
    };
    const result = await generateCompetitorIterations(clientId, options);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Competitor Iterations konnten nicht generiert werden." },
      { status: 400 }
    );
  }
}
