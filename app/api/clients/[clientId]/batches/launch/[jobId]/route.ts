import { NextResponse } from "next/server";
import { getBatchLaunchJob, mapLaunchJob } from "@/lib/batch-launch";
import { processBatchLaunch } from "@/lib/batch-launch-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ clientId: string; jobId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { clientId, jobId } = await context.params;
    return NextResponse.json({ job: mapLaunchJob(await getBatchLaunchJob(clientId, jobId)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload nicht gefunden." },
      { status: 400 }
    );
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const { clientId, jobId } = await context.params;
    return NextResponse.json({ job: await processBatchLaunch(clientId, jobId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload fehlgeschlagen." },
      { status: 400 }
    );
  }
}
