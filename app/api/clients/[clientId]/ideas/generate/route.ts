import { NextResponse } from "next/server";
import { generateAdIdeas, type GenerateAdIdeasOptions } from "@/lib/ad-ideas";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const options: GenerateAdIdeasOptions = {
      count: Number(body.count) || 10,
      format: body.format === "reel" || body.format === "static" || body.format === "carousel" || body.format === "all" ? body.format : "all",
      funnelStage: body.funnelStage === "TOFU" || body.funnelStage === "MOFU" || body.funnelStage === "BOFU" || body.funnelStage === "ALL" ? body.funnelStage : "ALL",
      focus: typeof body.focus === "string" ? body.focus : ""
    };
    const overview = await generateAdIdeas(clientId, options);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ad Ideas konnten nicht generiert werden." },
      { status: 400 }
    );
  }
}
