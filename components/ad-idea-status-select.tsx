"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statuses = [
  { value: "new", label: "New" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "in_production", label: "In Production" },
  { value: "launched", label: "Launched" },
  { value: "learned", label: "Learned" },
  { value: "rejected", label: "Rejected" }
];

export function AdIdeaStatusSelect({ clientId, ideaId, status }: { clientId: string; ideaId: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  async function update(nextStatus: string) {
    setValue(nextStatus);
    try {
      const response = await fetch(`/api/clients/${clientId}/ideas/${ideaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Status konnte nicht gespeichert werden.");
      startTransition(() => router.refresh());
    } catch (error) {
      setValue(status);
      toast.error(error instanceof Error ? error.message : "Status konnte nicht gespeichert werden.");
    }
  }

  return (
    <Select value={value} onValueChange={update} disabled={pending}>
      <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {statuses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
