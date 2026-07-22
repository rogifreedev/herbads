import Link from "next/link";
import { CalendarDays, Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreativeRankingTable } from "@/components/creative-ranking-table";
import { MetricCard } from "@/components/metric-card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDecimal, formatNumber, formatPercent, getGlobalPerformanceMetrics } from "@/lib/metrics";

export default async function DashboardPage() {
  const [t, tCommon] = await Promise.all([getTranslations("dashboard"), getTranslations("common")]);
  const { metrics, hasData } = await getGlobalPerformanceMetrics();
  const metricCards = hasData
    ? [
        { label: "Ad Spend", value: formatCurrency(metrics.spend), change: `${formatNumber(metrics.impressions)} Impr.`, tone: "neutral" as const },
        { label: "Blended ROAS", value: formatDecimal(metrics.roas), change: t("revenueChange", { value: formatCurrency(metrics.purchaseValue) }), tone: "positive" as const },
        { label: "Sales", value: formatNumber(metrics.purchases), change: `${metrics.costPerPurchase === null ? "-" : formatCurrency(metrics.costPerPurchase)} CPP`, tone: "positive" as const },
        { label: "CTR", value: formatPercent(metrics.ctr), change: `${formatNumber(metrics.outboundClicks)} Outbound`, tone: "neutral" as const }
      ]
    : [
        { label: "Ad Spend", value: "-", change: t("noInsightsYet"), tone: "neutral" as const },
        { label: "Blended ROAS", value: "-", change: t("startMetaSync"), tone: "neutral" as const },
        { label: "Sales", value: "-", change: tCommon("noData"), tone: "neutral" as const },
        { label: "CTR", value: "-", change: tCommon("noData"), tone: "neutral" as const }
      ];

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="rounded-xl border border-herb-border bg-card p-6 shadow-[var(--shadow-sm)]">
          <p className="text-sm text-muted-foreground">{t("heroSubtitle")}</p>
          <h2 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-tight text-foreground md:text-5xl">
            {t("heroTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("heroDescription")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <div className="inline-flex h-11 items-center rounded-md border border-herb-border px-4 text-sm font-medium text-muted-foreground">
              <CalendarDays className="mr-2 h-4 w-4" />
              {t("last30Days")}
            </div>
            <Button asChild variant="gradient" size="lg">
              <Link href="/reports">
                <Download className="mr-2 h-4 w-4" />
                {t("exportReport")}
              </Link>
            </Button>
          </div>
        </div>
        <Card className="border-herb-border bg-card">
          <CardHeader>
            <CardTitle>{t("systemStatus")}</CardTitle>
            <CardDescription>{t("systemStatusDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-4"><span>{t("metaDataFlow")}</span><span className="font-semibold text-primary">Sync + Backfill</span></div>
            <Separator />
            <div className="flex items-center justify-between gap-4"><span>Creative Intelligence</span><span className="font-semibold text-primary">Score + AI</span></div>
            <Separator />
            <div className="flex items-center justify-between gap-4"><span>{t("knowledgeBaseRow")}</span><span className="font-semibold text-primary">{t("ragReady")}</span></div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section>
        <CreativeRankingTable />
      </section>
    </div>
  );
}
