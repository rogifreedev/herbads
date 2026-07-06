"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdIdeasGenerateForm({ clientId, defaultFocus, defaultCount = "10", buttonLabel, hideFocus = false }: { clientId: string; defaultFocus?: string; defaultCount?: string; buttonLabel?: string; hideFocus?: boolean }) {
  const t = useTranslations("ideas");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState("all");
  const [funnelStage, setFunnelStage] = useState("ALL");
  const [count, setCount] = useState(defaultCount);
  const [focus, setFocus] = useState(defaultFocus ?? t("defaultFocus"));

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/ideas/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format, funnelStage, count: Number(count), focus })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("generateError"));
      toast.success(t("generated"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("generateError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={hideFocus ? "grid gap-3 md:grid-cols-[120px_140px_120px_auto] md:items-end" : "grid gap-3 md:grid-cols-[120px_140px_120px_minmax(220px,1fr)_auto] md:items-end"}>
      <label className="grid gap-1 text-xs text-white/55">Format
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tCommon("all")}</SelectItem>
            <SelectItem value="reel">Reel</SelectItem>
            <SelectItem value="static">Static</SelectItem>
            <SelectItem value="carousel">Carousel</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-white/55">Funnel
        <Select value={funnelStage} onValueChange={setFunnelStage}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{tCommon("all")}</SelectItem>
            <SelectItem value="TOFU">TOFU</SelectItem>
            <SelectItem value="MOFU">MOFU</SelectItem>
            <SelectItem value="BOFU">BOFU</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-white/55">{tCommon("count")}
        <Input value={count} onChange={(event) => setCount(event.target.value)} inputMode="numeric" className="h-9" />
      </label>
      {hideFocus ? null : (
        <label className="grid gap-1 text-xs text-white/55">{t("focusLabel")}
          <Input value={focus} onChange={(event) => setFocus(event.target.value)} className="h-9" />
        </label>
      )}
      <Button type="button" disabled={loading || pending} onClick={submit}>
        <Sparkles className="mr-2 h-4 w-4" />
        {buttonLabel ?? t("generateButton")}
      </Button>
    </div>
  );
}
