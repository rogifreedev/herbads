"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CompetitorIterationStatus } from "@/lib/competitor-iterations";

const statuses: CompetitorIterationStatus[] = ["new", "shortlisted", "in_production", "tested", "winner", "rejected"];
const statusLabels: Record<CompetitorIterationStatus, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  in_production: "In Production",
  tested: "Tested",
  winner: "Winner",
  rejected: "Rejected"
};

export function CompetitorIterationStatusSelect({ clientId, iterationId, status }: { clientId: string; iterationId: string; status: CompetitorIterationStatus }) {
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  async function update(nextStatus: string) {
    const previousStatus = value;
    setValue(nextStatus as CompetitorIterationStatus);

    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/iterations/${iterationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? tCommon("statusSaveError"));
      startTransition(() => router.refresh());
    } catch (error) {
      setValue(previousStatus);
      toast.error(error instanceof Error ? error.message : tCommon("statusSaveError"));
    }
  }

  return (
    <Select value={value} onValueChange={update} disabled={pending}>
      <SelectTrigger className="h-8 w-[158px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {statuses.map((item) => <SelectItem key={item} value={item}>{statusLabels[item]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
