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
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-white/55">{label}</p>
              <KpiHelp label={label} description={description} />
            </div>
            <p className="mt-3 font-heading text-4xl leading-none text-white">{value}</p>
          </div>
          <Badge variant={variant}>{change}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
