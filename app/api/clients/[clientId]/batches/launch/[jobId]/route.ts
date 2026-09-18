import { NextResponse } from "next/server";
import { getBatchLaunchJob, mapLaunchJob } from "@/lib/batch-launch";
import { controlBatchUpload } from "@/lib/batch-upload-queue";

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

export async function POST(request: Request, context: Context) {
  try {
    const { clientId, jobId } = await context.params;
    const body = await request.text();
    // Older open tabs may still POST to advance a step. Never resume a paused queue job implicitly.
    const job = body.trim()
      ? await controlBatchUpload(clientId, jobId, JSON.parse(body).action)
      : mapLaunchJob(await getBatchLaunchJob(clientId, jobId));
    return NextResponse.json({ job }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload fehlgeschlagen." },
      { status: 400 }
    );
  }
}
