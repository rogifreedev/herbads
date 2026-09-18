"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, ExternalLink, Eye, Loader2, Pause, Play, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import type { BatchUploadItem, BatchUploadOverview } from "@/lib/batch-launch-types";

const selectClass = "h-10 max-w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
export function BatchUploadDashboard({ initialClientId = "" }: { initialClientId?: string }) {
  const t = useTranslations("batchUploads");
  const launch = useTranslations("batchLaunch");
  const locale = useLocale();
  const [clientId, setClientId] = useState(initialClientId);
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; data: BatchUploadOverview; receivedAt: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [cancelJob, setCancelJob] = useState<BatchUploadItem | null>(null);
  const key = `${clientId}:${status}:${page}`;
  const data = snapshot?.key === key ? snapshot.data : undefined;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const params = new URLSearchParams({ status, page: String(page), ...(clientId ? { clientId } : {}) });
        const response = await fetch(`/api/batch-uploads?${params}`, { signal: controller.signal, cache: "no-store" });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error ?? t("loadError"));
        if (!controller.signal.aborted) {
          setSnapshot({ key, data: value, receivedAt: Date.now() });
          setError("");
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t("loadError"));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [clientId, status, page, key, revision, t]);

  async function control(job: BatchUploadItem, action: "pause" | "resume" | "cancel") {
    setBusy(job.id);
    try {
      const response = await fetch(`/api/clients/${job.client_id}/batches/launch/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? t("actionError"));
      setCancelJob(null);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("actionError"));
    } finally {
      setBusy("");
    }
  }

  const stale =
    data?.runtime.enabled &&
    (!data.runtime.scheduler_seen_at ||
      (snapshot?.receivedAt ?? 0) - Date.parse(data.runtime.scheduler_seen_at) > 120000);
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <h2 className="font-heading text-3xl">{t("title")}</h2>
        <div className="flex items-center gap-3">
          {data ? (
            <Badge variant={data.runtime.enabled && !stale ? "success" : "outline"}>
              {t(!data.runtime.enabled ? "workerPaused" : stale ? "workerStale" : "workerReady")}
            </Badge>
          ) : null}
          <Button
            size="icon"
            variant="outline"
            title={t("refresh")}
            aria-label={t("refresh")}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {error ? (
        <Alert variant="warning">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {data && (!data.runtime.enabled || stale || data.runtime.last_error) ? (
        <Alert variant="warning">
          <AlertDescription>
            {data.runtime.last_error || t(stale ? "workerStaleNotice" : "workerPausedNotice")}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="upload-client">{t("client")}</Label>
          <select
            id="upload-client"
            className={`${selectClass} block w-72`}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("allClients")}</option>
            {(data?.clients ?? snapshot?.data.clients ?? []).map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div
          role="tablist"
          aria-label={t("statusFilter")}
          className="flex max-w-full flex-wrap gap-1 border-b border-border"
        >
          {["active", "attention", "completed", "all"].map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={status === value}
              className={`border-b-2 px-3 py-2 text-sm ${status === value ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
              onClick={() => {
                setStatus(value);
                setPage(0);
              }}
            >
              {t(value)}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <div role="status" className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm md:min-w-[800px]">
              <thead className="hidden border-b border-border text-xs text-muted-foreground md:table-header-group">
                <tr>
                  <th className="w-[30%] py-3 pr-4">{t("batch")}</th>
                  <th className="w-[26%] py-3 pr-4">{t("status")}</th>
                  <th className="w-[24%] py-3 pr-4">{t("progress")}</th>
                  <th className="w-[20%] py-3 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {data.jobs.map((job) => {
                  const running =
                    job.queue_enabled && ["pending", "running"].includes(job.status) && job.control_status === "run";
                  const terminal = ["completed", "cancelled", "review"].includes(job.status);
                  const progress = job.files_done + job.ads_done;
                  const total = job.file_count + job.ad_count;
                  const pendingControl = job.status === "running" && job.control_status !== "run";
                  return (
                    <tr
                      key={job.id}
                      className="grid grid-cols-1 gap-3 border-b border-border py-4 align-top md:table-row md:py-0"
                    >
                      <td className="block min-w-0 break-words md:table-cell md:py-4 md:pr-4">
                        <Link
                          className="font-medium hover:underline"
                          href={`/clients/${job.client_id}/batches/create?folderId=${encodeURIComponent(job.drive_folder_id)}&jobId=${job.id}`}
                        >
                          {job.name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {job.client_name} · {job.account_name}
                        </p>
                        <time className="mt-2 block text-xs text-muted-foreground" dateTime={job.created_at}>
                          {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
                            new Date(job.created_at)
                          )}
                        </time>
                      </td>
                      <td className="block min-w-0 break-words md:table-cell md:py-4 md:pr-4">
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "success"
                              : ["failed", "review"].includes(job.status)
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {pendingControl
                            ? launch(job.control_status === "pause" ? "pausing" : "cancelling")
                            : job.status === "completed" && job.activated
                              ? launch("activated")
                              : launch(`status.${job.status}`)}
                        </Badge>
                        {job.queue_position ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t("queuePosition", { position: job.queue_position })}
                          </p>
                        ) : null}
                        {!job.queue_enabled && ["pending", "running"].includes(job.status) ? (
                          <p className="mt-2 text-xs text-muted-foreground">{t("legacy")}</p>
                        ) : null}
                        {job.error ? <p className="mt-2 text-xs text-destructive">{job.error}</p> : null}
                        {job.activation_started && !job.activated ? (
                          <p className="mt-2 text-xs text-destructive">{launch("activationUncertain")}</p>
                        ) : null}
                      </td>
                      <td className="block min-w-0 md:table-cell md:py-4 md:pr-4">
                        <p className="break-words">
                          {job.step === "activate" ? launch("activateStep") : launch(`steps.${job.step as "adset"}`)}
                        </p>
                        <progress
                          className="my-2 h-2 w-full accent-primary"
                          value={job.status === "completed" ? total : progress}
                          max={total || 1}
                          aria-label={t("progress")}
                        />
                        <p className="text-xs text-muted-foreground">
                          {launch("progress", {
                            ads: job.ads_done,
                            total: job.ad_count,
                            files: job.files_done,
                            fileTotal: job.file_count
                          })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {launch(job.activate ? "activationRequested" : "paused")}
                        </p>
                      </td>
                      <td className="block min-w-0 md:table-cell md:py-4">
                        <div className="flex flex-wrap gap-1 md:justify-end">
                          {!terminal ? (
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={busy === job.id}
                              title={launch(running ? "stopUpload" : "resumeUpload")}
                              aria-label={launch(running ? "stopUpload" : "resumeUpload")}
                              onClick={() => control(job, running ? "pause" : "resume")}
                            >
                              {busy === job.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : running ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                          {!terminal ? (
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={busy === job.id}
                              title={t("cancel")}
                              aria-label={t("cancel")}
                              onClick={() => setCancelJob(job)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button asChild variant="outline" size="icon">
                            <Link
                              title={t("details")}
                              aria-label={t("details")}
                              href={`/clients/${job.client_id}/batches/create?folderId=${encodeURIComponent(job.drive_folder_id)}&jobId=${job.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {job.adset_id ? (
                            <Button asChild variant="outline" size="icon">
                              <a
                                title={launch("openMeta")}
                                aria-label={launch("openMeta")}
                                href={`https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${job.meta_account_id.replace(/^act_/, "")}&selected_adset_ids=${job.adset_id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.jobs.length ? <p className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</p> : null}
          </div>
          <footer className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{t("total", { count: data.total })}</span>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                disabled={page === 0}
                title={t("previous")}
                aria-label={t("previous")}
                onClick={() => setPage((value) => value - 1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(data.total / 50))}
              </span>
              <Button
                size="icon"
                variant="outline"
                disabled={(page + 1) * 50 >= data.total}
                title={t("next")}
                aria-label={t("next")}
                onClick={() => setPage((value) => value + 1)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </footer>
        </>
      )}
      <Dialog
        open={Boolean(cancelJob)}
        onOpenChange={(open) => {
          if (!open && !busy) setCancelJob(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelTitle")}</DialogTitle>
            <DialogDescription>{t("cancelNotice")}</DialogDescription>
          </DialogHeader>
          <p className="break-words text-sm">{cancelJob?.name}</p>
          <DialogFooter>
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => setCancelJob(null)}>
              {t("keep")}
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(busy)}
              onClick={() => cancelJob && control(cancelJob, "cancel")}
            >
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
