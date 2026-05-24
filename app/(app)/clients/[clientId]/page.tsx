import Link from "next/link";
import { MetaBackfillCard } from "@/components/meta-backfill-card";
import { MetaSyncButton } from "@/components/meta-sync-button";
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
        { label: "ROAS", value: formatDecimal(metrics.roas), change: `${formatCurrency(metrics.purchaseValue)} Umsatz`, tone: "positive" as const },
        { label: "Sales", value: formatNumber(metrics.purchases), change: `${metrics.costPerPurchase === null ? "–" : formatCurrency(metrics.costPerPurchase)} CPP`, tone: "positive" as const },
        { label: "CTR", value: formatPercent(metrics.ctr), change: `${formatNumber(metrics.outboundClicks)} Outbound Clicks`, tone: "neutral" as const }
      ]
    : [
        { label: "Spend", value: "–", change: "Noch keine Insights", tone: "neutral" as const },
        { label: "ROAS", value: "–", change: "Meta Sync starten", tone: "neutral" as const },
        { label: "Sales", value: "–", change: "Keine Daten", tone: "neutral" as const },
        { label: "CTR", value: "–", change: "Keine Daten", tone: "neutral" as const }
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
          <MetaSyncButton clientId={client.id} />
        </div>
      </div>

      {error ? (
        <Alert variant="warning"><AlertDescription>Supabase-Tabellen sind noch nicht erreichbar. Diese Seite nutzt bis zur Migration Mock-Daten.</AlertDescription></Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <MetaBackfillCard clientId={client.id} />

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
