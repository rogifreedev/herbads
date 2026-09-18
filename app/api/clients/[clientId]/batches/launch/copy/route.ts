import { NextResponse } from "next/server";
import { getBatchTemplateCopy } from "@/lib/batch-template-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const params = new URL(request.url).searchParams;
    const result = await getBatchTemplateCopy(clientId, params.get("accountId") ?? "", params.get("templateId") ?? "");
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Vorlagentexte konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
