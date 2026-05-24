"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type BulkCreativeAnalysisButtonProps = {
  clientId: string;
  creativeIds: string[];
};

type BulkStatus = {
  id: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  processedItems: number;
  percent: number;
  pauseUntil: string | null;
  errorMessage: string | null;
  activeItem: { creativeId: string; index: number; status: string; attempts: number; errorMessage: string | null } | null;
};

function isActiveStatus(status?: string) {
  return status === "pending" || status === "running" || status === "paused";
}

export function BulkCreativeAnalysisButton({ clientId, creativeIds }: BulkCreativeAnalysisButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<BulkStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const previousStatusRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/creatives/bulk-analysis`, { cache: "no-store" });
    if (!response.ok) return;

    const result = await response.json();
    setStatus(result.status ?? null);
  }, [clientId]);

  const kickWorker = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      await fetch(`/api/clients/${clientId}/creatives/bulk-analysis/process`, { method: "POST" });
    } finally {
      processingRef.current = false;
    }
  }, [clientId]);

  useEffect(() => {
    loadStatus().catch(() => undefined);
  }, [loadStatus]);

  useEffect(() => {
    if (!isActiveStatus(status?.status)) return;

    const interval = window.setInterval(() => {
      loadStatus().catch(() => undefined);
      if (status?.status !== "paused") kickWorker().catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [kickWorker, loadStatus, status?.status]);

  useEffect(() => {
    if (!status) return;

    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status.status;

    if (previousStatus && isActiveStatus(previousStatus) && !isActiveStatus(status.status)) {
      if (status.failedItems > 0) {
        toast.warning(`AI Bulk-Analyse fertig mit ${status.failedItems} Fehlern.`);
      } else {
        toast.success("AI Bulk-Analyse abgeschlossen.");
      }
      startTransition(() => router.refresh());
    }
  }, [router, status]);

  async function analyzeAll() {
    if (creativeIds.length === 0) return;

    const confirmed = window.confirm(`${creativeIds.length} Creatives im Hintergrund neu analysieren? Das startet ${creativeIds.length} AI-Anfragen und kann Kosten verursachen.`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/creatives/bulk-analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creativeIds })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "AI Bulk-Analyse konnte nicht gestartet werden.");

      setStatus(result.status ?? null);
      toast.success("AI Bulk-Analyse wurde als Hintergrundjob gestartet.");
      kickWorker().catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI Bulk-Analyse konnte nicht gestartet werden.");
    } finally {
      setLoading(false);
    }
  }

  if (isActiveStatus(status?.status)) {
    const pausedUntil = status?.pauseUntil ? new Date(status.pauseUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-white md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">AI Bulk-Analyse laeuft im Hintergrund</p>
          <p className="mt-1 text-xs text-white/60">
            {status.processedItems} von {status.totalItems} verarbeitet ({status.percent}%){status.failedItems > 0 ? `, ${status.failedItems} Fehler` : ""}
            {pausedUntil ? `, pausiert bis ${pausedUntil}` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" className="border-herb-border" disabled={loading || isPending} onClick={() => loadStatus().catch(() => undefined)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Aktualisieren
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" className="border-herb-border" disabled={creativeIds.length === 0 || loading} onClick={analyzeAll}>
      {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
      Alle sichtbaren im Hintergrund analysieren ({creativeIds.length})
    </Button>
  );
}
