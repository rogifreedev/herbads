import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type MetaAdsTab = "overview" | "creatives" | "batches" | "angles" | "landingpages" | "iterations";

type MetaAdsTabsProps = {
  clientId: string;
  active: MetaAdsTab;
};

const tabs: Array<{ id: MetaAdsTab; labelKey: string; href: (clientId: string) => string }> = [
  { id: "overview", labelKey: "creatives", href: (clientId) => `/clients/${clientId}` },
  { id: "creatives", labelKey: "library", href: (clientId) => `/clients/${clientId}/creatives` },
  { id: "batches", labelKey: "batches", href: (clientId) => `/clients/${clientId}/creatives/batches` },
  { id: "angles", labelKey: "angles", href: (clientId) => `/clients/${clientId}/angles` },
  { id: "landingpages", labelKey: "landingpages", href: (clientId) => `/clients/${clientId}/creatives/landingpages` },
  { id: "iterations", labelKey: "iterations", href: (clientId) => `/clients/${clientId}/iterations` }
];

export async function MetaAdsTabs({ clientId, active }: MetaAdsTabsProps) {
  const t = await getTranslations("nav");

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
