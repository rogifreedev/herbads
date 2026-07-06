"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type CreativeAnalysisButtonProps = {
  clientId: string;
  creativeId: string;
  hasAnalysis?: boolean;
};

export function CreativeAnalysisButton({ clientId, creativeId, hasAnalysis = false }: CreativeAnalysisButtonProps) {
  const t = useTranslations("creatives");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    const response = await fetch(`/api/clients/${clientId}/creatives/${creativeId}/analyze`, { method: "POST" });
    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      toast.error(result.error ?? t("analyzeError"));
      return;
    }

    toast.success(t("analysisSaved"));
    router.refresh();
  }

  return (
    <Button type="button" variant={hasAnalysis ? "outline" : "gradient"} className={hasAnalysis ? "border-herb-border" : undefined} disabled={loading} onClick={analyze}>
      <Sparkles className="mr-2 h-4 w-4" />
      {loading ? t("analyzing") : hasAnalysis ? t("reanalyze") : t("startAiAnalysis")}
    </Button>
  );
}
