import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDecimal, formatNumber, formatPercent, type PerformanceMetrics } from "@/lib/metrics";

type ClientPerformanceCardProps = {
  clientId: string;
  clientName: string;
  metrics: PerformanceMetrics;
  hasData: boolean;
  labels: {
    period: string;
    noData: string;
    spend: string;
    roas: string;
    conversions: string;
    impressions: string;
    ctr: string;
    revenue: string;
    open: string;
  };
};

function KpiValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-border/70 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-heading text-xl font-semibold leading-tight text-foreground" title={value}>{value}</p>
    </div>
  );
}

export function ClientPerformanceCard({ clientId, clientName, metrics, hasData, labels }: ClientPerformanceCardProps) {
  const emptyValue = "-";

  return (
    <Link href={`/clients/${clientId}`} className="group block" aria-label={labels.open}>
      <Card className="h-full border-herb-border bg-card transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-md)]">
        <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {clientName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">{clientName}</CardTitle>
              <Badge variant={hasData ? "secondary" : "warning"} className="mt-1.5">
                {hasData ? labels.period : labels.noData}
              </Badge>
            </div>
          </div>
          <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-5 gap-y-3 p-5 pt-0">
          <KpiValue label={labels.spend} value={hasData ? formatCurrency(metrics.spend) : emptyValue} />
          <KpiValue label={labels.roas} value={hasData ? formatDecimal(metrics.roas) : emptyValue} />
          <KpiValue label={labels.conversions} value={hasData ? formatNumber(metrics.purchases) : emptyValue} />
          <KpiValue label={labels.impressions} value={hasData ? formatNumber(metrics.impressions) : emptyValue} />
          <KpiValue label={labels.ctr} value={hasData ? formatPercent(metrics.ctr) : emptyValue} />
          <KpiValue label={labels.revenue} value={hasData ? formatCurrency(metrics.purchaseValue) : emptyValue} />
        </CardContent>
      </Card>
    </Link>
  );
}
