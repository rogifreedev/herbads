import { NextResponse } from "next/server";
import { listMetaAdAccounts } from "@/lib/meta/ad-accounts";

export async function GET() {
  const result = await listMetaAdAccounts();
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}
