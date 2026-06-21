"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CompetitorOption = {
  id: string;
  name: string;
};

export function CompetitorFilterSelect({ competitors, selectedCompetitorId }: { competitors: CompetitorOption[]; selectedCompetitorId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateCompetitor(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("competitor");
    else params.set("competitor", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={selectedCompetitorId ?? "all"} onValueChange={updateCompetitor}>
      <SelectTrigger className="h-9 w-full border-herb-border bg-black/20 sm:w-[260px]">
        <SelectValue placeholder="Competitor auswaehlen" />
      </SelectTrigger>
      <SelectContent className="border-herb-border bg-herb-surface text-white">
        <SelectItem value="all">Alle Competitors</SelectItem>
        {competitors.map((competitor) => (
          <SelectItem key={competitor.id} value={competitor.id}>
            {competitor.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
