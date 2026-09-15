import { NextResponse } from "next/server";
import { deleteLaunchPreset, getLaunchPresets, saveLaunchPreset } from "@/lib/batch-launch";

export const runtime = "nodejs";
type Context = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { clientId } = await context.params;
    return NextResponse.json({
      presets: await getLaunchPresets(clientId, new URL(request.url).searchParams.get("accountId") ?? "")
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Vorlagen nicht verfuegbar." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { clientId } = await context.params;
    const body = await request.json();
    return NextResponse.json({ presets: await saveLaunchPreset(clientId, body.accountId, body.preset) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Vorlage konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { clientId } = await context.params;
    const body = await request.json();
    return NextResponse.json({ presets: await deleteLaunchPreset(clientId, body.accountId, body.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Vorlage konnte nicht geloescht werden." },
      { status: 400 }
    );
  }
}
