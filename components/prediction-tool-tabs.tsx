import Link from "next/link";
import { cn } from "@/lib/utils";

type PredictionToolTab = "analysis" | "history";

type PredictionToolTabsProps = {
  clientId: string;
  active: PredictionToolTab;
};

const tabs: Array<{ id: PredictionToolTab; label: string; href: (clientId: string) => string }> = [
  { id: "analysis", label: "Analyse", href: (clientId) => `/clients/${clientId}/prediction-tool` },
  { id: "history", label: "History", href: (clientId) => `/clients/${clientId}/prediction-tool/history` }
];

export function PredictionToolTabs({ clientId, active }: PredictionToolTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href(clientId)}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm transition",
            active === tab.id ? "border-primary bg-primary text-white" : "border-herb-border bg-black/20 text-white/65 hover:border-primary/60 hover:text-white"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
