import { NextResponse } from "next/server";
import { launchAccount } from "@/lib/batch-launch";
import { getBatchLocales } from "@/lib/meta/batch-locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const url = new URL(request.url);
    await launchAccount(clientId, url.searchParams.get("accountId") ?? "");
    const q = url.searchParams.get("q")?.slice(0, 60) ?? "";
    const idList = url.searchParams.get("ids");
    if (idList !== null && (!/^\d+(,\d+)*$/.test(idList) || idList.length > 800))
      throw new Error("Ungueltige Sprach-IDs.");
    const ids = idList === null ? undefined : [...new Set(idList.split(",").map(Number))];
    if (ids && (ids.length > 50 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)))
      throw new Error("Ungueltige Sprach-IDs.");
    return NextResponse.json(
      { locales: await getBatchLocales(q, url.searchParams.get("language") ?? "de", ids) },
      {
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sprachen konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
