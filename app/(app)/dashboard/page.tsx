import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreativeRankingTable } from "@/components/creative-ranking-table";
import { MetricCard } from "@/components/metric-card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDecimal, formatNumber, formatPercent, getGlobalPerformanceMetrics } from "@/lib/metrics";

export default async function DashboardPage() {
  const { metrics, hasData } = await getGlobalPerformanceMetrics();
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
    <div className="flex flex-1 flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden border-herb-border bg-[radial-gradient(circle_at_top_right,rgba(229,31,118,0.26),transparent_32%),#111827]">
          <CardContent className="flex min-h-[280px] flex-col justify-between p-6">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-primary">Creative Intelligence</p>
              <h2 className="mt-3 max-w-3xl font-heading text-4xl leading-tight text-white md:text-6xl">
                Meta Creatives analysieren, verstehen und skalieren.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/65">
                KPI-Dashboard, Creative Scoring, AI Analyse, Knowledge Base und Pattern Engine in einem internen Workflow.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg"><Link href="/clients">Kunden verbinden</Link></Button>
              <Button asChild variant="outline" size="lg" className="border-herb-border"><Link href="/analysis">Patterns ansehen</Link></Button>
            </div>
          </CardContent>
        </Card>
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Aktueller MVP-Workflow</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-white/70">
            <div className="flex items-center justify-between gap-4"><span>Meta Datenfluss</span><span className="text-primary">Sync + Backfill</span></div>
            <Separator />
            <div className="flex items-center justify-between gap-4"><span>Creative Intelligence</span><span className="text-primary">Score + AI</span></div>
            <Separator />
            <div className="flex items-center justify-between gap-4"><span>Wissensbasis</span><span className="text-primary">RAG bereit</span></div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <CreativeRankingTable />
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>AI Learnings</CardTitle>
            <CardDescription>Erste Hypothesen aus Creative- und Wissensdaten.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-white/70">
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              Top-Creatives nutzen aktuell haeufig echte Personen, klare Problem-Hooks und sichtbare Produkt-Demos in den ersten Sekunden.
            </div>
            <div className="rounded-xl border border-herb-border bg-black/20 p-4">
              Naechster Schritt: Meta Sync anbinden, damit echte Performance-Daten die Mock-Daten ersetzen.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
