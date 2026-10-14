import "server-only";
import { resolveInsightDateFilters } from "@/lib/date-filters";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { summarizeAdsetOutput, type AdsetOutputBatch } from "@/lib/adset-output-summary";

export class OutputDateError extends Error {}

export function outputDateRange(params: URLSearchParams) {
  if (params.get("range") !== "all") {
    for (const key of ["since", "until"]) {
      const value = params.get(key);
      if (value === null) continue;
      const date = new Date(`${value}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        throw new OutputDateError("Invalid date");
    }
  }
  const range = resolveInsightDateFilters(Object.fromEntries(params), 30);
  if (range.dateError) throw new OutputDateError("Invalid date range");
  return range;
}

export async function getAdsetOutput(params: URLSearchParams) {
  const range = outputDateRange(params);
  const db = createSupabaseServiceRoleClient();
  const batches: AdsetOutputBatch[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.rpc("get_adset_output", { p_since: range.since, p_until: range.until })
      .order("first_delivery_date", { ascending: false }).order("job_id").range(offset, offset + pageSize - 1);
    if (error) throw new Error("Adset output query failed", { cause: error });
    batches.push(...(data ?? []) as AdsetOutputBatch[]);
    if (!data || data.length < pageSize) break;
  }
  return summarizeAdsetOutput(batches);
}
