import { NextResponse } from "next/server";
import { deleteBatchDriveFolder, getBatchSettings, upsertBatchSettings } from "@/lib/batches";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const result = await getBatchSettings(clientId);
    return NextResponse.json(result, { status: result.error ? 400 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Batch Settings konnten nicht geladen werden." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await upsertBatchSettings(clientId, {
      googleDriveFolderUrl: typeof body.googleDriveFolderUrl === "string" ? body.googleDriveFolderUrl : "",
      label: typeof body.label === "string" ? body.label : undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Batch Settings konnten nicht gespeichert werden." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await deleteBatchDriveFolder(clientId, typeof body.folderId === "string" ? body.folderId : "");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Drive Ordner konnte nicht entfernt werden." }, { status: 400 });
  }
}
