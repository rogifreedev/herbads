import { NextResponse } from "next/server";
import { getAdsetOutput, OutputDateError } from "@/lib/adset-output";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getAdsetOutput(new URL(request.url).searchParams), { headers });
  } catch (error) {
    const invalidDate = error instanceof OutputDateError;
    return NextResponse.json({ error: invalidDate ? "invalidDate" : "loadError" }, {
      status: invalidDate ? 400 : 500, headers
    });
  }
}
