import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { syncMetaCommentsForClient } from "@/lib/meta-comments";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type AccountRow = {
  client_id: string;
  status: string;
  clients: { status?: string | null } | Array<{ status?: string | null }> | null;
};

function clientStatus(clients: AccountRow["clients"]) {
  return Array.isArray(clients) ? clients[0]?.status : clients?.status;
}

function assertCronAuth(request: Request) {
  const secret = getOptionalEnv("CRON_SECRET");
  if (!secret) throw new Error("CRON_SECRET fehlt.");
  if (request.headers.get("authorization") !== `Bearer ${secret}` && request.headers.get("x-cron-secret") !== secret) {
    throw new Error("Nicht autorisiert.");
  }
}

export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.from("meta_ad_accounts").select("client_id,status,clients(status)");
    if (error) throw new Error(error.message);
    const clientIds = [...new Set(((data ?? []) as AccountRow[])
      .filter((account) => clientStatus(account.clients) === "active" && (account.status === "active" || account.status === "1"))
      .map((account) => account.client_id))];
    const results = [];
    for (const clientId of clientIds) {
      try {
        results.push({ clientId, status: "completed", ...await syncMetaCommentsForClient(clientId) });
      } catch (error) {
        results.push({ clientId, status: "failed", error: error instanceof Error ? error.message : "Kommentar-Sync fehlgeschlagen." });
      }
    }
    return NextResponse.json({ clients: clientIds.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kommentar-Cron konnte nicht ausgefuehrt werden.";
    return NextResponse.json({ error: message }, { status: message === "Nicht autorisiert." ? 401 : 400 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
