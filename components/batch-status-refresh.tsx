"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

export function BatchStatusRefresh({ clientId }: { clientId: string }) {
  const router = useRouter();
  const t = useTranslations("batches");
  const locale = useLocale();
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let lastAttempt = 0;

    async function refresh() {
      if (disposed || document.hidden || controller || Date.now() - lastAttempt < 10_000) return;
      lastAttempt = Date.now();
      controller = new AbortController();
      const activeController = controller;
      const timeout = window.setTimeout(() => activeController.abort(), 110_000);
      setChecking(true);
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/batches/status`, {
          method: "POST",
          cache: "no-store",
          signal: activeController.signal
        });
        if (!response.ok) throw new Error("Status refresh failed");
        const result = await response.json();
        if (disposed) return;
        setFailed(result.unavailable > 0);
        setCheckedAt(result.checkedAt);
        if (result.changed) router.refresh();
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        if (!disposed) setChecking(false);
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [clientId, router]);

  return (
    <p role="status" className={`flex min-h-5 items-center gap-2 text-xs ${failed ? "text-amber-700" : "text-muted-foreground"}`}>
      {checking ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : null}
      <span>
        {checking ? t("metaStatusRefreshing") : failed ? t("metaStatusRefreshFailed") : checkedAt ? t("metaStatusRefreshed", {
          time: new Intl.DateTimeFormat(locale, { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(checkedAt))
        }) : null}
      </span>
    </p>
  );
}
