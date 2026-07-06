import { BatchPerformanceTable } from "@/components/batch-performance-table";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { MetaAdsTabs } from "@/components/meta-ads-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resolveInsightDateFilters } from "@/lib/date-filters";
import { listFoundBatchPerformance } from "@/lib/batch-performance";
import { formatCurrency, formatDecimal, formatNumber } from "@/lib/metrics";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function ClientCreativeBatchesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const dateFilters = resolveInsightDateFilters(resolvedSearchParams);
  const activeDateRange = dateFilters.dateError ? undefined : dateFilters;
  const { batches, error } = await listFoundBatchPerformance(clientId, activeDateRange);
  const totals = batches.reduce(
    (sum, batch) => ({
      ads: sum.ads + batch.adCount,
      creatives: sum.creatives + batch.creativeCount,
      spend: sum.spend + batch.metrics.spend,
      purchaseValue: sum.purchaseValue + batch.metrics.purchaseValue,
      purchases: sum.purchases + batch.metrics.purchases
    }),
    { ads: 0, creatives: 0, spend: 0, purchaseValue: 0, purchases: 0 }
  );
  const roas = totals.spend > 0 ? totals.purchaseValue / totals.spend : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Batch Performance</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">Gefundene Batch-Ordner aus dem gespeicherten Snapshot, angereichert mit Meta KPIs im gewaehlten Zeitraum.</p>
        </div>
        <CreativeDateRangePicker defaultDays={30} />
      </div>

      <MetaAdsTabs clientId={clientId} active="batches" />

      {error ? (
        <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}
      {dateFilters.dateError ? <Alert variant="warning"><AlertDescription>{dateFilters.dateError}</AlertDescription></Alert> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Batches" value={formatNumber(batches.length)} />
        <Metric label="Ads" value={formatNumber(totals.ads)} />
        <Metric label="Creatives" value={formatNumber(totals.creatives)} />
        <Metric label="Spend" value={formatCurrency(totals.spend)} />
        <Metric label="ROAS" value={formatDecimal(roas)} />
      </div>

      <BatchPerformanceTable batches={batches} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-herb-border bg-herb-surface/90 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 font-heading text-3xl text-white">{value}</p>
    </div>
  );
}
