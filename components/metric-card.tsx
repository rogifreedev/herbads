import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KpiHelp } from "@/components/kpi-help";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  change: string;
  tone?: "positive" | "neutral" | "warning";
  description?: string;
};

export function MetricCard({ label, value, change, tone = "neutral", description }: MetricCardProps) {
  const variant = tone === "positive" ? "success" : tone === "warning" ? "warning" : "secondary";
  const compactValue = value.length > 8;
  const denseValue = value.length > 12;

  return (
    <Card className="border-herb-border bg-card transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <KpiHelp label={label} description={description} />
          </div>
          <Badge variant={variant} className="max-w-[58%] shrink-0 truncate whitespace-nowrap">{change}</Badge>
        </div>
        <p
          className={cn(
            "mt-5 block w-full overflow-hidden whitespace-nowrap font-heading font-semibold leading-none tracking-normal text-foreground",
            denseValue ? "text-3xl 2xl:text-4xl" : compactValue ? "text-4xl 2xl:text-[2.625rem]" : "text-4xl 2xl:text-5xl"
          )}
          title={value}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
