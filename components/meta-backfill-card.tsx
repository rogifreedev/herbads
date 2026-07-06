"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Play, PauseCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Translator } from "@/lib/i18n-types";

type BackfillStatus = {
  id: string;
  status: string;
  since: string;
  until: string;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  totalInsights: number;
  percent: number;
  pauseUntil: string | null;
  errorMessage: string | null;
  nextChunk: { index: number; since: string; until: string; status: string; attempts: number } | null;
} | null;

type ApiResult = {
  status?: BackfillStatus;
  error?: string;
};

export function MetaBackfillCard({ clientId }: { clientId: string }) {
  const t = useTranslations("metaSettings");
  const locale = useLocale();
  const router = useRouter();
  const loopRef = useRef(false);
  const [status, setStatus] = useState<BackfillStatus>(null);
  const [loading, setLoading] = useState(false);
  const isActive = status?.status === "pending" || status?.status === "running" || status?.status === "paused";
  const isPaused = status?.status === "paused" && status.pauseUntil && new Date(status.pauseUntil).getTime() > Date.now();
  const canProcess = status?.status === "pending" || status?.status === "running" || (status?.status === "paused" && !isPaused);

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/meta/backfill`, { cache: "no-store" });
    const result = (await response.json()) as ApiResult;
    if (!response.ok) throw new Error(result.error ?? t("backfillStatusError"));
    setStatus(result.status ?? null);
    return result.status ?? null;
  }, [clientId, t]);

  const runWorkerLoop = useCallback(async () => {
    if (loopRef.current) return;
    loopRef.current = true;

    try {
      let nextStatus = await loadStatus();
      while (nextStatus?.status === "pending" || nextStatus?.status === "running" || (nextStatus?.status === "paused" && (!nextStatus.pauseUntil || new Date(nextStatus.pauseUntil).getTime() <= Date.now()))) {
        const response = await fetch(`/api/clients/${clientId}/meta/backfill/process`, { method: "POST" });
        const result = (await response.json()) as ApiResult;
        if (!response.ok) throw new Error(result.error ?? t("backfillWorkerError"));
        nextStatus = result.status ?? null;
        setStatus(nextStatus);

        if (nextStatus?.status === "paused") {
          toast.warning(t("backfillPausedToast"));
          break;
        }
        if (nextStatus?.status === "completed") {
          toast.success(t("backfillCompleted"));
          router.refresh();
          break;
        }
        if (nextStatus?.status === "failed") {
          toast.error(t("backfillFinishedWithErrors"));
          router.refresh();
          break;
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("backfillFailed"));
    } finally {
      loopRef.current = false;
      setLoading(false);
    }
  }, [clientId, loadStatus, router, t]);

  useEffect(() => {
    loadStatus().catch(() => undefined);
  }, [loadStatus]);

  useEffect(() => {
    if (!isActive) return;
    const interval = window.setInterval(() => {
      loadStatus().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [isActive, loadStatus]);

  useEffect(() => {
    if (canProcess) {
      runWorkerLoop().catch(() => undefined);
    }
  }, [canProcess, runWorkerLoop]);

  async function startBackfill() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/meta/backfill`, { method: "POST" });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error ?? t("backfillStartError"));
      setStatus(result.status ?? null);
      toast.success(t("backfillStarted"));
      await runWorkerLoop();
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : t("backfillStartError"));
    }
  }

  const percent = status?.percent ?? 0;
  const tone = status?.status === "completed" ? "text-emerald-300" : status?.status === "failed" ? "text-red-200" : status?.status === "paused" ? "text-amber-200" : "text-white";
  const Icon = status?.status === "completed" ? CheckCircle2 : status?.status === "failed" ? AlertTriangle : status?.status === "paused" ? PauseCircle : RefreshCw;

  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{t("backfillTitle")}</CardTitle>
            <p className="mt-2 text-sm text-white/55">{t("backfillDescription")}</p>
          </div>
          <Button type="button" variant="gradient" onClick={startBackfill} disabled={loading || status?.status === "running" || status?.status === "pending"}>
            {loading || status?.status === "running" || status?.status === "pending" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {status ? t("resumeBackfill") : t("startBackfill")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className={tone}>
            <Icon className={`mr-2 inline h-4 w-4 ${status?.status === "running" || status?.status === "pending" ? "animate-spin" : ""}`} />
            {status ? statusLabel(status.status, t) : t("noBackfillYet")}
          </span>
          {status ? <span className="text-white/55">{status.completedChunks}/{status.totalChunks} Chunks, {status.totalInsights} Insights</span> : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/35">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        {status ? (
          <div className="flex flex-wrap gap-2 text-xs text-white/55">
            <span className="rounded-full border border-herb-border bg-black/25 px-3 py-1">{t("rangeChip", { since: formatDate(status.since, locale), until: formatDate(status.until, locale) })}</span>
            <span className="rounded-full border border-herb-border bg-black/25 px-3 py-1">{t("progressChip", { percent })}</span>
            {status.nextChunk ? <span className="rounded-full border border-herb-border bg-black/25 px-3 py-1">{t("nextChunkChip", { index: status.nextChunk.index + 1, since: formatDate(status.nextChunk.since, locale), until: formatDate(status.nextChunk.until, locale) })}</span> : null}
            {status.failedChunks > 0 ? <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-100">{t("failedChip", { count: status.failedChunks })}</span> : null}
          </div>
        ) : null}
        {isPaused ? <Alert variant="warning"><AlertDescription>{t("pausedUntil", { time: new Date(status.pauseUntil as string).toLocaleString(locale) })}</AlertDescription></Alert> : null}
        {status?.errorMessage ? <p className="rounded-lg border border-herb-border bg-black/20 p-3 text-xs text-white/55">{t("lastMessage", { message: status.errorMessage })}</p> : null}
      </CardContent>
    </Card>
  );
}

function statusLabel(status: string, t: Translator) {
  if (status === "completed") return t("statusCompleted");
  if (status === "failed") return t("statusFailed");
  if (status === "paused") return t("statusPaused");
  if (status === "running") return t("statusRunning");
  return t("statusPending");
}

function formatDate(value: string, locale: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
