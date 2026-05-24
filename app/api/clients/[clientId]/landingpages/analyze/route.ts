import { NextResponse } from "next/server";
import { analyzeLandingpage } from "@/lib/landingpage-crawler";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return NextResponse.json({ error: "Landingpage URL fehlt." }, { status: 400 });
    }

    const analysis = await analyzeLandingpage(clientId, body.url);
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Landingpage konnte nicht analysiert werden." },
      { status: 400 }
    );
  }
}
