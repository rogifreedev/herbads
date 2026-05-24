import { NextResponse } from "next/server";
import { generateClientProfileFromKnowledge } from "@/lib/profile-ai";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const result = await generateClientProfileFromKnowledge(clientId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kundenprofil konnte nicht aus der Wissensdatenbank erstellt werden." },
      { status: 400 }
    );
  }
}
