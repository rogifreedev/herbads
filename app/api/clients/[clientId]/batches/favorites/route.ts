import { NextResponse } from "next/server";
import { getTemplateFavorites, setTemplateFavorite } from "@/lib/batch-launch";

export const runtime = "nodejs";
type Context = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { clientId } = await context.params;
    return NextResponse.json({
      favoriteTemplateIds: await getTemplateFavorites(
        clientId,
        new URL(request.url).searchParams.get("accountId") ?? ""
      )
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Favoriten nicht verfuegbar." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { clientId } = await context.params;
    const body = await request.json();
    return NextResponse.json({
      favoriteTemplateIds: await setTemplateFavorite(clientId, body.accountId, body.templateId, body.favorite)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Favorit konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
