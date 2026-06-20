import Link from "next/link";
import { cn } from "@/lib/utils";

type MetaAdsTab = "overview" | "creatives" | "angles" | "landingpages" | "iterations";

type MetaAdsTabsProps = {
  clientId: string;
  active: MetaAdsTab;
};

const tabs: Array<{ id: MetaAdsTab; label: string; href: (clientId: string) => string }> = [
  { id: "overview", label: "Creatives", href: (clientId) => `/clients/${clientId}` },
  { id: "creatives", label: "Library", href: (clientId) => `/clients/${clientId}/creatives` },
  { id: "angles", label: "Angles", href: (clientId) => `/clients/${clientId}/angles` },
  { id: "landingpages", label: "Landingpages", href: (clientId) => `/clients/${clientId}/creatives/landingpages` },
  { id: "iterations", label: "Iterations", href: (clientId) => `/clients/${clientId}/iterations` }
];

export function MetaAdsTabs({ clientId, active }: MetaAdsTabsProps) {
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
