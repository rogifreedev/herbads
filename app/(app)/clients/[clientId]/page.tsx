import Link from "next/link";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { CreativeRankingTable } from "@/components/creative-ranking-table";
import { MetaAdsTabs } from "@/components/meta-ads-tabs";
import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getClientById } from "@/lib/clients";
import { resolveInsightDateFilters, type DateFilterSearchParams } from "@/lib/date-filters";
import { listClientCreatives } from "@/lib/creatives";
import { formatCurrency, formatDecimal, formatNumber, formatPercent, getClientPerformanceBreakdownsForRange, getClientPerformanceMetricsForRange, type PerformanceBreakdownDimension, type PerformanceBreakdownRow } from "@/lib/metrics";

export default async function ClientDashboardPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<DateFilterSearchParams> }) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const dateFilters = resolveInsightDateFilters(resolvedSearchParams);
  const activeDateRange = dateFilters.dateError ? undefined : dateFilters;
  const [{ client, error }, { metrics, hasData }, { creatives }, breakdowns] = await Promise.all([
    getClientById(clientId),
    getClientPerformanceMetricsForRange(clientId, activeDateRange),
    listClientCreatives(clientId, activeDateRange),
    getClientPerformanceBreakdownsForRange(clientId, activeDateRange)
  ]);
  const metricCards = hasData
    ? [
        { label: "Spend", value: formatCurrency(metrics.spend), change: `${formatNumber(metrics.impressions)} Impr.`, tone: "neutral" as const },
        { label: "CPC", value: metrics.cpc === null ? "–" : formatCurrency(metrics.cpc, 2), change: `${formatNumber(metrics.clicks)} Clicks`, tone: "neutral" as const },
        { label: "CPM", value: metrics.cpm === null ? "–" : formatCurrency(metrics.cpm, 2), change: `${formatNumber(metrics.impressions)} Impr.`, tone: "neutral" as const },
        { label: "Reach", value: formatNumber(metrics.reach), change: `${metrics.frequency === null ? "–" : formatDecimal(metrics.frequency, 2)} Freq.`, tone: "neutral" as const },
        { label: "Impr.", value: formatNumber(metrics.impressions), change: `${formatNumber(metrics.reach)} Reach`, tone: "neutral" as const },
        { label: "Conversions", value: formatNumber(metrics.purchases), change: `${metrics.costPerPurchase === null ? "–" : formatCurrency(metrics.costPerPurchase, 2)} CPA`, tone: "positive" as const },
        { label: "Conv. Value", value: formatCurrency(metrics.purchaseValue), change: `${formatNumber(metrics.purchases)} Conv.`, tone: "positive" as const },
        { label: "CPA", value: metrics.costPerPurchase === null ? "–" : formatCurrency(metrics.costPerPurchase, 2), change: `${formatNumber(metrics.purchases)} Conv.`, tone: "neutral" as const },
        { label: "CTR", value: formatPercent(metrics.ctr), change: `${formatNumber(metrics.clicks)} Clicks`, tone: "neutral" as const },
        { label: "Hook", value: formatPercent(metrics.hookRate), change: `${formatNumber(metrics.video3sViews)} 3s Views`, tone: "neutral" as const },
        { label: "Hold", value: formatPercent(metrics.holdRate), change: `${formatNumber(metrics.thruplays)} ThruPlays`, tone: "neutral" as const },
        { label: "Outbound CVR", value: formatPercent(metrics.outboundCvr), change: `${formatNumber(metrics.outboundClicks)} Outbound`, tone: "neutral" as const },
        { label: "ROAS", value: formatDecimal(metrics.roas), change: `${formatCurrency(metrics.purchaseValue)} Conv. Value`, tone: "positive" as const }
      ]
    : [
        { label: "Spend", value: "–", change: "Noch keine Insights", tone: "neutral" as const },
        { label: "CPC", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "CPM", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "Reach", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "Impr.", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "Conversions", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "Conv. Value", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "CPA", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "CTR", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "Hook", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "Hold", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "Outbound CVR", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "ROAS", value: "–", change: "Meta Sync starten", tone: "neutral" as const }
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-primary">Kunden-Dashboard</p>
          <h2 className="mt-2 font-heading text-5xl">{client.name}</h2>
          <p className="mt-2 font-mono text-xs text-white/45">{client.adAccountId ?? "Kein Meta Account hinterlegt"}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CreativeDateRangePicker defaultDays={30} />
          <Button asChild variant="outline" className="border-herb-border">
            <Link href={`/clients/${client.id}/knowledge`}>Wissen pflegen</Link>
          </Button>
        </div>
      </div>

      <MetaAdsTabs clientId={client.id} active="overview" />

      {error ? (
        <Alert variant="warning"><AlertDescription>Supabase-Tabellen sind noch nicht erreichbar. Diese Seite nutzt bis zur Migration Mock-Daten.</AlertDescription></Alert>
      ) : null}
      {breakdowns.error ? (
        <Alert variant="warning"><AlertDescription>Meta Demografie-Breakdowns konnten noch nicht geladen werden: {breakdowns.error}</AlertDescription></Alert>
      ) : null}
      {dateFilters.dateError ? <Alert variant="warning"><AlertDescription>{dateFilters.dateError}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <PerformanceBreakdownCard title="Laender" valueLabel="Land" dimension="country" rows={breakdowns.countries} emptyLabel="Noch keine Laender-Breakdowns. Fuehre einen neuen Meta Sync aus, damit Meta Country-Daten importiert." />
        <PerformanceBreakdownCard title="Alter" valueLabel="Alter" dimension="age" rows={breakdowns.ages} emptyLabel="Noch keine Alters-Breakdowns. Fuehre einen neuen Meta Sync aus, damit Meta Age-Daten importiert." />
        <PerformanceBreakdownCard title="Gender" valueLabel="Gender" dimension="gender" rows={breakdowns.genders} emptyLabel="Noch keine Gender-Breakdowns. Fuehre einen neuen Meta Sync aus, damit Meta Gender-Daten importiert." />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <CreativeRankingTable clientId={client.id} creatives={creatives} title="Top Creatives" />
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Knowledge Status</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-white/65">
            Kundenspezifische Zielgruppen-, Branding- und Claim-Dokumente werden spaeter per Supabase Vector in AI-Analysen einbezogen.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const COUNTRY_LABELS: Record<string, string> = {
  AT: "Oesterreich",
  CH: "Schweiz",
  DE: "Deutschland",
  ES: "Spanien",
  FR: "Frankreich",
  GB: "Vereinigtes Koenigreich",
  IT: "Italien",
  NL: "Niederlande",
  PL: "Polen",
  US: "USA"
};

const GENDER_LABELS: Record<string, string> = {
  female: "Female",
  male: "Male",
  unknown: "Unknown"
};

function breakdownValueLabel(dimension: PerformanceBreakdownDimension, value: string) {
  const normalizedValue = value.trim();
  if (dimension === "country") return COUNTRY_LABELS[normalizedValue.toUpperCase()] ?? normalizedValue.toUpperCase();
  if (dimension === "gender") return GENDER_LABELS[normalizedValue.toLowerCase()] ?? normalizedValue;
  return normalizedValue;
}

function PerformanceBreakdownCard({ title, valueLabel, dimension, rows, emptyLabel }: { title: string; valueLabel: string; dimension: PerformanceBreakdownDimension; rows: PerformanceBreakdownRow[]; emptyLabel: string }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-herb-border bg-black/15 p-4 text-sm leading-6 text-white/55">{emptyLabel}</p>
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-xl border border-herb-border">
            <Table className="min-w-[560px]">
              <TableHeader className="sticky top-0 z-10 bg-herb-surface">
                <TableRow className="hover:bg-transparent">
                  <TableHead>{valueLabel}</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Conv.</TableHead>
                  <TableHead>Reach</TableHead>
                  <TableHead>Spend-Anteil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${dimension}-${row.value}`}>
                    <TableCell className="font-medium text-white">{breakdownValueLabel(dimension, row.value)}</TableCell>
                    <TableCell className="text-white">{formatCurrency(row.metrics.spend)}</TableCell>
                    <TableCell className="text-white">{formatNumber(row.metrics.purchases)}</TableCell>
                    <TableCell className="text-white/70">{formatNumber(row.metrics.reach)}</TableCell>
                    <TableCell className="text-primary">{formatPercent(row.spendShare)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
