import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type PredictionToolTab = "analysis" | "history";

type PredictionToolTabsProps = {
  clientId: string;
  active: PredictionToolTab;
};

const tabs: Array<{ id: PredictionToolTab; labelKey: "tabAnalysis" | "tabHistory"; href: (clientId: string) => string }> = [
  { id: "analysis", labelKey: "tabAnalysis", href: (clientId) => `/clients/${clientId}/prediction-tool` },
  { id: "history", labelKey: "tabHistory", href: (clientId) => `/clients/${clientId}/prediction-tool/history` }
];

export function PredictionToolTabs({ clientId, active }: PredictionToolTabsProps) {
  const t = useTranslations("predictionTool");

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
          {t(tab.labelKey)}
        </Link>
      ))}
    </div>
  );
}
