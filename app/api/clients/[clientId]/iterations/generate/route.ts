import { NextResponse } from "next/server";
import { generateAdIterations, type GenerateAdIterationsOptions, type GenerateIterationFormat } from "@/lib/creative-iterations";

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

function requestBody(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = requestBody(await request.json().catch(() => ({})));
    const options: GenerateAdIterationsOptions = {
      format: formatParam(body.format),
      count: Number(body.count) || 6,
      mode: "manual"
    };

    if (Object.prototype.hasOwnProperty.call(body, "since")) options.since = dateParam(body.since);
    if (Object.prototype.hasOwnProperty.call(body, "until")) options.until = dateParam(body.until);

    const result = await generateAdIterations(clientId, options);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Iterations konnten nicht generiert werden." },
      { status: 400 }
    );
  }
}
