import "server-only";
import { getRequiredEnv } from "@/lib/env";
import type { BatchCampaign, BatchTemplate } from "@/lib/batch-launch-types";

export class MetaLaunchError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export async function metaLaunchRequest<T>(
  path: string,
  data?: Record<string, unknown> | FormData,
  video = false
): Promise<T> {
  const version = process.env.META_API_VERSION?.trim() || "v25.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Ungueltige Meta API Version.");
  const url = new URL(`https://${video ? "graph-video" : "graph"}.facebook.com/${version}/${path}`);
  let response: Response;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getRequiredEnv("META_SYSTEM_USER_ACCESS_TOKEN")}`
  };
  const isForm = data instanceof FormData;
  if (data && !isForm) headers["Content-Type"] = "application/json";
  try {
    response = await fetch(url, {
      method: data ? "POST" : "GET",
      headers,
      body: isForm ? data : data ? JSON.stringify(data) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(35000)
    });
  } catch {
    throw new MetaLaunchError(
      "Meta-Anfrage unterbrochen. Der letzte Erstellungsschritt muss geprueft werden.",
      Boolean(data)
    );
  }
  const payload = await response.json().catch(() => null);
  if (!payload || !response.ok || payload.error) {
    throw new MetaLaunchError(
      payload?.error?.error_user_msg ?? payload?.error?.message ?? `Meta-Anfrage fehlgeschlagen (${response.status}).`,
      Boolean(data) && (!payload?.error || response.status >= 500),
      payload?.error
    );
  }
  return payload as T;
}

export async function metaLaunchList<T>(path: string) {
  const items: T[] = [];
  let after: string | undefined;
  do {
    const result = await metaLaunchRequest<{ data: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(
      `${path}${after ? `&after=${encodeURIComponent(after)}` : ""}`
    );
    items.push(...result.data);
    if (items.length > 5000) throw new Error("Zu viele Meta-Eintraege. Bitte das Werbekonto eingrenzen.");
    after = result.paging?.next ? result.paging.cursors?.after : undefined;
  } while (after);
  return items;
}

export function mapBatchCampaign(raw: Record<string, unknown>): BatchCampaign {
  return {
    id: String(raw.id),
    name: String(raw.name ?? raw.id),
    objective: String(raw.objective ?? ""),
    status: String(raw.status ?? ""),
    dailyBudget: Number(raw.daily_budget ?? 0),
    lifetimeBudget: Number(raw.lifetime_budget ?? 0)
  };
}

export const BATCH_CAMPAIGN_FIELDS =
  "id,account_id,name,objective,status,daily_budget,lifetime_budget,special_ad_categories";
export const BATCH_TEMPLATE_FIELDS =
  "id,account_id,name,campaign_id,status,targeting,promoted_object,optimization_goal,billing_event,bid_strategy,bid_amount,attribution_spec,destination_type,is_dynamic_creative,dsa_beneficiary,dsa_payor,daily_budget";

export async function getLiveBatchOptions(metaAccountId: string) {
  const [campaigns, templates] = await Promise.all([
    metaLaunchList<Record<string, unknown>>(`${metaAccountId}/campaigns?fields=${BATCH_CAMPAIGN_FIELDS}&limit=100`),
    metaLaunchList<Record<string, unknown>>(`${metaAccountId}/adsets?fields=${BATCH_TEMPLATE_FIELDS}&limit=100`)
  ]);
  return {
    campaigns: campaigns.filter((item) => ["ACTIVE", "PAUSED"].includes(String(item.status))).map(mapBatchCampaign),
    templates: templates
      .filter((item) => ["ACTIVE", "PAUSED"].includes(String(item.status)))
      .sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"))
      .map(
        (raw): BatchTemplate => ({
          id: String(raw.id),
          name: String(raw.name),
          campaignId: String(raw.campaign_id),
          raw
        })
      )
  };
}
