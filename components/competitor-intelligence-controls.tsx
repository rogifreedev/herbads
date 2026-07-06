"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CompetitorIntelligenceTab = "overview" | "creatives" | "angles" | "landingpages";

type CompetitorOption = {
  id: string;
  name: string;
};

type Props = {
  activeTab: CompetitorIntelligenceTab;
  competitors: CompetitorOption[];
  selectedCompetitorId: string | null;
};

const tabs: Array<{ id: CompetitorIntelligenceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "creatives", label: "Creatives" },
  { id: "angles", label: "Angles" },
  { id: "landingpages", label: "Landingpages" }
];

export function CompetitorIntelligenceControls({ activeTab, competitors, selectedCompetitorId }: Props) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefForTab(tab: CompetitorIntelligenceTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function updateCompetitor(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("competitor");
    else params.set("competitor", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={hrefForTab(tab.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm transition",
              activeTab === tab.id ? "border-primary bg-primary text-white" : "border-herb-border bg-black/20 text-white/65 hover:border-primary/60 hover:text-white"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div className="w-full xl:w-72">
        <Select value={selectedCompetitorId ?? "all"} onValueChange={updateCompetitor}>
          <SelectTrigger className="border-herb-border bg-black/20">
            <SelectValue placeholder={t("selectCompetitor")} />
          </SelectTrigger>
          <SelectContent className="border-herb-border bg-herb-surface text-white">
            <SelectItem value="all">{t("allCompetitors")}</SelectItem>
            {competitors.map((competitor) => (
              <SelectItem key={competitor.id} value={competitor.id}>
                {competitor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
