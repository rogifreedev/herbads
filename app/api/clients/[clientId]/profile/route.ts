import { NextResponse } from "next/server";
import { getClientProfile, upsertClientProfile, type ClientProfileInput } from "@/lib/clients";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function GET(_request: Request, context: RouteContext) {
  const { clientId } = await context.params;
  const result = await getClientProfile(clientId);
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { clientId } = await context.params;
    const body = await request.json();
    const input: ClientProfileInput = {
      brandName: stringValue(body.brandName),
      positioning: stringValue(body.positioning),
      toneOfVoice: stringValue(body.toneOfVoice),
      targetAudience: stringValue(body.targetAudience),
      painPoints: stringValue(body.painPoints),
      buyingTriggers: stringValue(body.buyingTriggers),
      usps: stringValue(body.usps),
      offers: stringValue(body.offers),
      forbiddenClaims: stringValue(body.forbiddenClaims),
      brandNoGos: stringValue(body.brandNoGos),
      competitors: stringValue(body.competitors),
      ctaPreferences: stringValue(body.ctaPreferences)
    };

    const profile = await upsertClientProfile(clientId, input);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Partnerprofil konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
