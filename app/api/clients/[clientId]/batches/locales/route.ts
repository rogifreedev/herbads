import { NextResponse } from "next/server";
import { launchAccount } from "@/lib/batch-launch";
import { metaLaunchRequest } from "@/lib/meta/batch-launch";

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const url = new URL(request.url);
    await launchAccount(clientId, url.searchParams.get("accountId") ?? "");
    const q = url.searchParams.get("q")?.slice(0, 60) ?? "";
    const result = await metaLaunchRequest<{ data: { key: number; name: string }[] }>(
      `search?type=adlocale&q=${encodeURIComponent(q)}&limit=100`
    );
    return NextResponse.json({ locales: result.data.map((item) => ({ id: Number(item.key), name: item.name })) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sprachen konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
