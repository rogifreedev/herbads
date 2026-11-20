import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { metaLaunchList } from "@/lib/meta/batch-launch";
import { saveBatchAdsetSchedule, type AdsetStatus } from "@/lib/batch-status";

type CatalogAdset = AdsetStatus & { ad_account_id: string; name: string | null };
type RemoteAdset = {
  id: string; account_id: string; name: string; status: string; effective_status: string;
  start_time?: string; end_time?: string; campaign_id?: string;
};

export async function readBatchMetaCatalog(clientId: string, refresh = false): Promise<CatalogAdset[]> {
  const db = createSupabaseServiceRoleClient();
  const stored: CatalogAdset[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("meta_ad_sets")
      .select("id,ad_account_id,meta_adset_id,name,status,effective_status,raw,updated_at")
      .eq("client_id", clientId).order("id").range(offset, offset + 499);
    if (error) throw new Error("Meta-Adsets konnten nicht geladen werden.");
    stored.push(...(data ?? []) as CatalogAdset[]);
    if ((data?.length ?? 0) < 500) break;
  }
  if (!refresh || !process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()) return stored;

  const { data: accounts, error } = await db.from("meta_ad_accounts")
    .select("id,meta_account_id").eq("client_id", clientId);
  if (error) throw new Error("Meta-Werbekonten konnten nicht geladen werden.");
  const known = new Map(stored.map((row) => [`${row.ad_account_id}:${row.meta_adset_id}`, row]));
  const fetched: Array<{ accountId: string; rows: RemoteAdset[] }> = [];
  // Read the complete catalog, including adsets without spend or delivery insights.
  for (const account of accounts ?? []) {
    const metaId = String(account.meta_account_id).replace(/^act_/, "");
    if (!/^\d+$/.test(metaId)) throw new Error("Ungueltige Meta-Werbekonto-ID.");
    const rows = await metaLaunchList<RemoteAdset>(
      `act_${metaId}/adsets?fields=id,account_id,name,campaign_id,status,effective_status,start_time,end_time&limit=100`
    );
    if (rows.some((row) => !/^\d+$/.test(row.id) || String(row.account_id) !== metaId ||
      typeof row.name !== "string" || !row.status || !row.effective_status))
      throw new Error("Meta-Adsets konnten nicht eindeutig dem Werbekonto zugeordnet werden.");
    fetched.push({ accountId: account.id, rows });
  }

  for (const { accountId, rows } of fetched) {
    const newRows = rows.filter((row) => !known.has(`${accountId}:${row.id}`));
    for (let offset = 0; offset < newRows.length; offset += 200) {
      const { error: insertError } = await db.from("meta_ad_sets").upsert(newRows.slice(offset, offset + 200).map((row) => ({
        client_id: clientId, ad_account_id: accountId, meta_adset_id: row.id,
        name: row.name, status: row.status, effective_status: row.effective_status, raw: row
      })), { onConflict: "ad_account_id,meta_adset_id", ignoreDuplicates: true });
      if (insertError) throw new Error("Neue Meta-Adsets konnten nicht gespeichert werden.");
    }
    for (const row of rows) {
      const previous = known.get(`${accountId}:${row.id}`);
      if (!previous) continue;
      await saveBatchAdsetSchedule(clientId, previous, row);
      if (previous.name === row.name && previous.status === row.status && previous.effective_status === row.effective_status) continue;
      const { error: updateError } = await db.from("meta_ad_sets")
        .update({ name: row.name, status: row.status, effective_status: row.effective_status })
        .eq("client_id", clientId).eq("ad_account_id", accountId).eq("id", previous.id);
      if (updateError) throw new Error("Meta-Adsets konnten nicht aktualisiert werden.");
    }
  }
  return readBatchMetaCatalog(clientId);
}
