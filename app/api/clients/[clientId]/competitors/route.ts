import { NextResponse } from "next/server";
import { createCompetitor, getCompetitorOverview } from "@/lib/competitors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const overview = await getCompetitorOverview(clientId);
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitors konnten nicht geladen werden." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const overview = await createCompetitor(clientId, {
      name: typeof body.name === "string" ? body.name : "",
      websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl : null,
      metaPageId: typeof body.metaPageId === "string" ? body.metaPageId : null,
      metaAdLibraryUrl: typeof body.metaAdLibraryUrl === "string" ? body.metaAdLibraryUrl : null,
      notes: typeof body.notes === "string" ? body.notes : null
    });
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor konnte nicht gespeichert werden." }, { status: 400 });
  }
}
