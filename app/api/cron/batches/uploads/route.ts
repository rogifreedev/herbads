import { NextResponse } from "next/server";
import { authorizeBatchUploadWorker, processBatchUploadQueue } from "@/lib/batch-upload-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!(await authorizeBatchUploadWorker(secret)))
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  try {
    return NextResponse.json(await processBatchUploadQueue(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload-Worker fehlgeschlagen." },
      { status: 500 }
    );
  }
}
