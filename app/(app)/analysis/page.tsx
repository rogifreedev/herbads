import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { PatternInsightsDataTable } from "@/components/pattern-insights-data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGlobalPatternAnalysis, type PatternCreative } from "@/lib/pattern-analysis";
import { formatCurrency, formatNumber } from "@/lib/metrics";

export default async function AnalysisPage() {
  const t = await getTranslations("analysis");
  const { topCreatives, lowCreatives, insights, totals, error } = await getGlobalPatternAnalysis();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-4xl">META Ads</h2>
        <p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
      </div>
      {error ? (
        <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label={t("clients")} value={formatNumber(totals.clients)} />
        <SummaryCard label={t("creativesWithData")} value={formatNumber(totals.creatives)} />
        <SummaryCard label={t("withAiAnalysis")} value={formatNumber(totals.analyzedCreatives)} />
      </section>
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Pattern Engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-white/65">
          <p>
            {t("patternEngineDescription")}
          </p>
          <PatternInsightsDataTable insights={insights} />
        </CardContent>
      </Card>
      <section className="grid gap-4 xl:grid-cols-2">
        <CreativeGroup title="Top Performer" creatives={topCreatives} />
        <CreativeGroup title="Low Performer" creatives={lowCreatives} />
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
        <p className="mt-2 font-heading text-3xl text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

async function CreativeGroup({ title, creatives }: { title: string; creatives: PatternCreative[] }) {
  const t = await getTranslations("analysis");

  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {creatives.length === 0 ? (
          <EmptyState title={t("noCreativesFound")} description={t("noCreativesFoundDescription")} className="p-6" />
        ) : (
          <div className="space-y-3">
            {creatives.map((creative) => (
              <Link key={creative.id} href={`/clients/${creative.clientId}/creatives/${creative.id}`} className="block rounded-xl border border-herb-border bg-black/20 p-4 transition hover:border-primary/60">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="line-clamp-1 font-medium text-white">{creative.name}</p>
                    <p className="mt-1 text-xs text-white/45">{creative.clientName} · {creative.type} · {creative.funnelStage ?? t("noFunnel")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading text-2xl text-primary">{creative.performanceScore.score}</p>
                    <p className="text-xs text-white/40">Conf. {creative.performanceScore.confidence}%</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/60">
                  <span>{formatCurrency(creative.metrics.spend)}</span>
                  <span>ROAS {creative.metrics.roas?.toFixed(2) ?? "–"}</span>
                  <span>Conv. {formatNumber(creative.metrics.purchases)}</span>
                </div>
                {creative.analysis?.hook ? <p className="mt-3 line-clamp-2 text-sm text-white/65">Hook: {creative.analysis.hook}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
