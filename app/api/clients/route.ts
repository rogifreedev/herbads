import { NextResponse } from "next/server";
import { createClient, listClients } from "@/lib/clients";

export async function GET() {
  const result = await listClients();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const client = await createClient({
      name: String(body.name ?? ""),
      metaAccountId: String(body.metaAccountId ?? ""),
      brandName: body.brandName ? String(body.brandName) : undefined,
      targetAudience: body.targetAudience ? String(body.targetAudience) : undefined
    });

    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunde konnte nicht angelegt werden." },
      { status: 400 }
    );
  }
}
