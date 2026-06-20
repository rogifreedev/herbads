import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { getClientById } from "@/lib/clients";
import { listClientCreatives } from "@/lib/creatives";
import { CreativeRankingTable } from "@/components/creative-ranking-table";
import { formatCurrency, formatDecimal, formatNumber, formatPercent, getClientPerformanceMetrics } from "@/lib/metrics";

export default async function ClientDashboardPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const [{ client, error }, { metrics, hasData }, { creatives }] = await Promise.all([
    getClientById(clientId),
    getClientPerformanceMetrics(clientId),
    listClientCreatives(clientId)
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
        <div className="flex gap-3">
          <Button asChild variant="outline" className="border-herb-border">
            <Link href={`/clients/${client.id}/knowledge`}>Wissen pflegen</Link>
          </Button>
          <Button asChild variant="outline" className="border-herb-border">
            <Link href={`/clients/${client.id}/creatives`}>Creatives ansehen</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="warning"><AlertDescription>Supabase-Tabellen sind noch nicht erreichbar. Diese Seite nutzt bis zur Migration Mock-Daten.</AlertDescription></Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
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
