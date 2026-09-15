import { NextResponse } from "next/server";
import { createBatchLaunch, getBatchLaunchContext } from "@/lib/batch-launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { clientId } = await context.params;
    const url = new URL(request.url);
    return NextResponse.json(
      await getBatchLaunchContext(
        clientId,
        url.searchParams.get("folderId") ?? "",
        url.searchParams.get("accountId") ?? undefined
      )
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { clientId } = await context.params;
    return NextResponse.json({ job: await createBatchLaunch(clientId, await request.json()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch konnte nicht erstellt werden." },
      { status: 400 }
    );
  }
}
