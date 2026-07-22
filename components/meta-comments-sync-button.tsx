"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MetaCommentsSyncButton({ clientId }: { clientId: string }) {
  const t = useTranslations("comments");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function sync() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/comments/sync`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("syncError"));
      toast.success(t("syncSuccess", { count: Number(result.inserted ?? 0) }));
      if (result.aiError) toast.warning(result.aiError);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("syncError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" onClick={sync} disabled={loading || pending}>
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? t("syncing") : t("syncButton")}
    </Button>
  );
}
