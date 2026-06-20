import Link from "next/link";
import { BulkCreativeAnalysisButton } from "@/components/bulk-creative-analysis-button";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { CreativeTypeBadge } from "@/components/creative-type-badge";
import { CreativeRankingTable } from "@/components/creative-ranking-table";
import { EmptyState } from "@/components/empty-state";
import { FunnelStageBadge } from "@/components/funnel-stage-badge";
import { MetaAdsTabs } from "@/components/meta-ads-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listClientCreatives } from "@/lib/creatives";
import { formatCurrency, formatDate, formatDecimal, formatNumber } from "@/lib/metrics";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const normalized = firstParam(value)?.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerParam(value: string | string[] | undefined, fallback = 1) {
  const parsed = Math.floor(numberParam(value) ?? fallback);
  return Math.max(1, parsed);
}

function isDateParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateParam(value: string | string[] | undefined) {
  const normalized = firstParam(value)?.trim();
  return normalized && isDateParam(normalized) ? normalized : null;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days + 1);
  return formatDateInput(date);
}

function resolveDateFilters(searchParams: SearchParams) {
  const isAllRange = firstParam(searchParams.range) === "all";
  const hasExplicitDateRange = Boolean(firstParam(searchParams.since) || firstParam(searchParams.until));
  const since = isAllRange ? null : dateParam(searchParams.since) ?? (hasExplicitDateRange ? null : dateDaysAgo(30));
  const until = isAllRange ? null : dateParam(searchParams.until) ?? (hasExplicitDateRange ? null : formatDateInput(new Date()));
  const dateError = since && until && since > until ? "Startdatum darf nicht nach dem Enddatum liegen." : null;
  return { since, until, dateError, range: isAllRange ? "all" : null };
}

function dateSearchSuffix(filters: ReturnType<typeof resolveDateFilters>) {
  const params = new URLSearchParams();
  if (filters.range === "all") params.set("range", "all");
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function ClientCreativesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const dateFilters = resolveDateFilters(resolvedSearchParams);
  const activeDateRange = dateFilters.dateError ? undefined : dateFilters;
  const { creatives, error } = await listClientCreatives(clientId, activeDateRange);
  const rankingPage = integerParam(resolvedSearchParams.rankingPage);
  const detailHrefSuffix = dateFilters.dateError ? "" : dateSearchSuffix(dateFilters);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-heading text-4xl">Creative Library</h2>
            <p className="mt-2 text-sm text-white/60">Alle Meta Creatives, Performance KPIs und AI Analysen an einem Ort.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <CreativeDateRangePicker defaultDays={30} />
            <BulkCreativeAnalysisButton clientId={clientId} creativeIds={creatives.map((creative) => creative.id)} />
          </div>
        </div>
      </div>

      <MetaAdsTabs clientId={clientId} active="creatives" />

      {error ? (
        <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      {dateFilters.dateError ? <Alert variant="warning"><AlertDescription>{dateFilters.dateError}</AlertDescription></Alert> : null}

      <CreativeRankingTable
        clientId={clientId}
        creatives={creatives}
        title="Creative Ranking"
        detailHrefSuffix={detailHrefSuffix}
        currentPage={rankingPage}
      />
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Creative Grid</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {creatives.length === 0 ? (
            <EmptyState className="col-span-full" title="Noch keine Creatives synchronisiert" description="Starte im Kundendashboard den Meta Sync, um Creatives zu laden." />
          ) : null}
          {creatives.slice(0, 48).map((creative) => (
            <Link key={creative.id} href={`/clients/${clientId}/creatives/${creative.id}${detailHrefSuffix}`} className="group rounded-2xl border border-herb-border bg-black/30 p-4 transition hover:border-primary/60">
              <div className="aspect-[4/5] overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,rgba(229,31,118,0.2),transparent_45%),#1f2937]">
                {creative.thumbnailUrl || creative.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={creative.thumbnailUrl ?? creative.imageUrl ?? ""} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-end p-4">
                    <p className="font-heading text-2xl">{creative.type}</p>
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CreativeTypeBadge type={creative.type} />
                    <FunnelStageBadge stage={creative.funnelStage} />
                    <Badge variant={creative.status === "ACTIVE" ? "success" : "secondary"}>{creative.status}</Badge>
                  </div>
                  <span className="text-xs text-white/45">{creative.adCount} Ads</span>
                </div>
                <p className="line-clamp-2 font-medium text-white">{creative.name}</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-white/60">
                  <span>{formatCurrency(creative.metrics.spend)}</span>
                  <span>Aktiv {formatDate(creative.firstActiveDate)}</span>
                  <span className="truncate">LP {displayUrl(creative.landingUrl)}</span>
                  <span>Score {creative.performanceScore.score}/100</span>
                  <span>Conv. {formatNumber(creative.metrics.purchases)}</span>
                  <span>Value {formatCurrency(creative.metrics.purchaseValue)}</span>
                  <span>CPA {formatNullableCurrency(creative.metrics.costPerPurchase)}</span>
                  <span>CPC {formatNullableCurrency(creative.metrics.cpc)}</span>
                  <span>CPM {formatNullableCurrency(creative.metrics.cpm)}</span>
                  <span>ROAS {formatDecimal(creative.metrics.roas)}</span>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function displayUrl(value: string | null) {
  if (!value) return "–";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function formatNullableCurrency(value: number | null) {
  return value === null ? "–" : formatCurrency(value, 2);
}
