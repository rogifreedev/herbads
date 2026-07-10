import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type ClientReportSummary = {
  clientId: string;
  creatives: number;
  analyzed: number;
  totalSpend: number;
  purchases: number;
  avgScore: number | null;
  topCreativeName: string | null;
};

type ClientReportSummaryRow = {
  client_id: string;
  creative_count: number | string | null;
  analyzed_count: number | string | null;
  total_spend: number | string | null;
  purchases: number | string | null;
  average_score: number | string | null;
  top_creative_name: string | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getClientReportSummariesUncached(): Promise<ClientReportSummary[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("get_clients_report_summaries");
  if (error) throw new Error(error.message);

  return ((data ?? []) as ClientReportSummaryRow[]).map((row) => ({
    clientId: row.client_id,
    creatives: numberValue(row.creative_count),
    analyzed: numberValue(row.analyzed_count),
    totalSpend: numberValue(row.total_spend),
    purchases: numberValue(row.purchases),
    avgScore: row.average_score === null ? null : numberValue(row.average_score),
    topCreativeName: row.top_creative_name ?? null
  }));
}

export const getClientReportSummaries = unstable_cache(
  getClientReportSummariesUncached,
  ["client-report-summaries-v1"],
  { revalidate: 120, tags: [CACHE_TAGS.creatives, CACHE_TAGS.metrics] }
);
