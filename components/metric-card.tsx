import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KpiHelp } from "@/components/kpi-help";

type MetricCardProps = {
  label: string;
  value: string;
  change: string;
  tone?: "positive" | "neutral" | "warning";
  description?: string;
};

export function MetricCard({ label, value, change, tone = "neutral", description }: MetricCardProps) {
  const variant = tone === "positive" ? "success" : tone === "warning" ? "warning" : "secondary";

  return (
    <Card className="border-herb-border bg-card transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <KpiHelp label={label} description={description} />
            </div>
            <p className="mt-3 break-words font-mono text-3xl font-bold leading-none tracking-tight text-foreground 2xl:text-4xl">{value}</p>
          </div>
          <Badge variant={variant} className="shrink-0">{change}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
