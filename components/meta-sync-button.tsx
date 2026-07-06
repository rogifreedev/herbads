"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MetaSyncButtonProps = {
  clientId: string;
};

type DateRange = {
  since: string;
  until: string;
};

type SyncTotals = {
  campaigns: number;
  adSets: number;
  ads: number;
  creatives: number;
  insights: number;
};

type StoredMetaSyncJob = {
  since: string;
  until: string;
  ranges: DateRange[];
  done: number;
  failed: number;
  totals: SyncTotals;
  errors?: string[];
};

const emptyTotals: SyncTotals = { campaigns: 0, adSets: 0, ads: 0, creatives: 0, insights: 0 };

export function MetaSyncButton({ clientId }: MetaSyncButtonProps) {
  const t = useTranslations("metaSettings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const resumedRef = useRef(false);
  const storageKey = `herbads-meta-sync:${clientId}`;
  const [loading, setLoading] = useState(false);
  const [since, setSince] = useState(defaultSinceDate);
  const [until, setUntil] = useState(todayDate);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });
  const [ranges, setRanges] = useState<DateRange[]>([]);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);

  const saveJob = useCallback((job: StoredMetaSyncJob) => {
    window.localStorage.setItem(storageKey, JSON.stringify(job));
  }, [storageKey]);

  const clearJob = useCallback(() => {
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  const runQueue = useCallback(async (job: StoredMetaSyncJob) => {
    if (runningRef.current || job.ranges.length === 0) return;

    runningRef.current = true;
    cancelledRef.current = false;
    setLoading(true);
    setSince(job.since);
    setUntil(job.until);
    setRanges(job.ranges);
    setProgress({ done: job.done, failed: job.failed });
    setSyncErrors(job.errors ?? []);
    saveJob(job);

    let failed = job.failed;
    const totals = { ...job.totals };
    let errors = job.errors ?? [];

    const appendError = (message: string) => {
      errors = [message, ...errors].slice(0, 5);
      setSyncErrors(errors);
    };

    for (let index = job.done; index < job.ranges.length; index += 1) {
      if (cancelledRef.current) break;
      const range = job.ranges[index];

      try {
        const response = await fetch(`/api/clients/${clientId}/meta/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since: range.since, until: range.until, insightsOnly: index > 0 })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          failed += 1;
          const message = typeof result.error === "string" && result.error.trim().length > 0
            ? result.error
            : response.statusText || t("requestFailed");
          appendError(t("rangeError", { since: range.since, until: range.until, message }));
        } else {
          totals.campaigns = Math.max(totals.campaigns, Number(result.summary?.campaigns ?? 0));
          totals.adSets = Math.max(totals.adSets, Number(result.summary?.adSets ?? 0));
          totals.ads = Math.max(totals.ads, Number(result.summary?.ads ?? 0));
          totals.creatives = Math.max(totals.creatives, Number(result.summary?.creatives ?? 0));
          totals.insights += Number(result.summary?.insights ?? 0);
        }
      } catch (error) {
        failed += 1;
        appendError(t("rangeError", { since: range.since, until: range.until, message: error instanceof Error ? error.message : t("requestFailed") }));
      }

      const done = index + 1;
      setProgress({ done, failed });
      saveJob({ ...job, done, failed, totals, errors });
    }

    setLoading(false);
    runningRef.current = false;
    if (cancelledRef.current) {
      clearJob();
      toast.message(t("syncCancelled"));
    } else if (failed > 0) {
      clearJob();
      toast.warning(t("syncDoneWithErrors", { failed, insights: totals.insights }));
    } else {
      clearJob();
      toast.success(t("syncComplete", { ads: totals.ads, creatives: totals.creatives, insights: totals.insights }));
    }
    router.refresh();
  }, [clearJob, clientId, router, saveJob, t]);

  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const rawJob = window.localStorage.getItem(storageKey);
    if (!rawJob) return;

    try {
      const job = JSON.parse(rawJob) as StoredMetaSyncJob;
      if (!Array.isArray(job.ranges) || job.ranges.length === 0 || job.done >= job.ranges.length) {
        clearJob();
        return;
      }

      toast.message(t("syncResumed"));
      runQueue(job).catch(() => {
        runningRef.current = false;
        setLoading(false);
      });
    } catch {
      clearJob();
    }
  }, [clearJob, runQueue, storageKey, t]);

  async function sync() {
    if (!since || !until) return;
    if (since > until) {
      toast.error(t("dateRangeError"));
      return;
    }

    const nextRanges = splitDateRange({ since, until });
    const confirmed = window.confirm(t("syncConfirm", { count: nextRanges.length, since, until }));
    if (!confirmed) return;

    await runQueue({ since, until, ranges: nextRanges, done: 0, failed: 0, totals: emptyTotals, errors: [] });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-herb-border bg-black/20 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/55">
          {t("fromLabel")}
          <input
            type="date"
            value={since}
            max={until || todayDate}
            disabled={loading}
            onChange={(event) => setSince(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-herb-border bg-black/25 px-2 text-sm text-white outline-none focus:border-primary"
          />
        </label>
        <label className="text-xs text-white/55">
          {t("toLabel")}
          <input
            type="date"
            value={until}
            min={since || undefined}
            max={todayDate}
            disabled={loading}
            onChange={(event) => setUntil(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-herb-border bg-black/25 px-2 text-sm text-white outline-none focus:border-primary"
          />
        </label>
      </div>
      <Button type="button" variant="gradient" onClick={sync} disabled={loading || !since || !until}>
        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? t("syncing") : t("syncTitle")}
      </Button>
      {loading ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-xs text-white/70">
          <div className="flex items-center justify-between gap-3">
            <span>
              {t("syncProgress", { done: progress.done, total: ranges.length })}{progress.failed > 0 ? t("syncFailedSuffix", { count: progress.failed }) : ""}
            </span>
            <Button type="button" variant="outline" className="h-8 border-herb-border px-2" onClick={() => { cancelledRef.current = true; }}>
              <X className="mr-1 h-3.5 w-3.5" />
              {tCommon("cancel")}
            </Button>
          </div>
          {syncErrors.length > 0 ? (
            <div className="mt-2 space-y-1 border-t border-primary/20 pt-2 text-red-100">
              {syncErrors.slice(0, 3).map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateYearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return formatDateInput(date);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function splitDateRange(range: DateRange) {
  const ranges: DateRange[] = [];
  let since = range.since;

  while (since <= range.until) {
    const chunkUntil = addDays(since, 29);
    const until = chunkUntil < range.until ? chunkUntil : range.until;
    ranges.push({ since, until });
    since = addDays(until, 1);
  }

  return ranges;
}

const todayDate = formatDateInput(new Date());
const defaultSinceDate = dateYearsAgo(2);
