"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function BatchCheckButton({ clientId, disabled = false }: { clientId: string; disabled?: boolean }) {
  const t = useTranslations("batches");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/batches/check`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? t("checkFailed"));
      toast.success(t("checkSaved", { count: result.overview?.totals?.folders ?? 0 }));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("checkFailed"));
      startTransition(() => router.refresh());
    } finally {
      setLoading(false);
    }
  }

  const isBusy = loading || pending;

  return (
    <Button type="button" variant="gradient" disabled={disabled || isBusy} onClick={check}>
      <RefreshCw className={`mr-2 h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
      {isBusy ? t("checking") : t("check")}
    </Button>
  );
}
