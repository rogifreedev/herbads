import { NextResponse } from "next/server";
import { getBatchUploadOverview } from "@/lib/batch-upload-queue";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return NextResponse.json(await getBatchUploadOverview(new URL(request.url).searchParams), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Uploads konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
