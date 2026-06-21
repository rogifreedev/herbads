"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdIterationsGenerateForm({ clientId, since, until, defaultFormat = "all" }: { clientId: string; since?: string | null; until?: string | null; defaultFormat?: "all" | "static" | "video" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState(defaultFormat);
  const [count, setCount] = useState("6");

  useEffect(() => {
    setFormat(defaultFormat);
  }, [defaultFormat]);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/iterations/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format, count: Number(count), since, until })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Iterations konnten nicht generiert werden.");
      const created = Array.isArray(result.summaries) ? result.summaries.reduce((sum: number, item: { created?: number }) => sum + Number(item.created ?? 0), 0) : 0;
      toast.success(created > 0 ? `${created} neue Iterations generiert.` : "Generation abgeschlossen, keine neuen Iterations erstellt.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Iterations konnten nicht generiert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="grid gap-1 text-xs text-white/55">Format
        <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
          <SelectTrigger className="h-9 w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="static">Statics</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-white/55">Anzahl
        <Input value={count} onChange={(event) => setCount(event.target.value)} inputMode="numeric" className="h-9 w-full sm:w-[96px]" />
      </label>
      <Button type="button" disabled={loading || pending} onClick={submit}>
        <Sparkles className="mr-2 h-4 w-4" />
        Neue Iterations generieren
      </Button>
    </div>
  );
}
