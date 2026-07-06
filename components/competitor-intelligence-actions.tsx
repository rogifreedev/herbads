"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Competitor } from "@/lib/competitors";

type Props = {
  clientId: string;
  competitors: Competitor[];
};

type BulkCompetitorAnalysisStatus = {
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

function isActiveBulkStatus(status?: string) {
  return status === "pending" || status === "running" || status === "paused";
}

export function CompetitorCreateForm({ clientId }: { clientId: string }) {
  const t = useTranslations("competitors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [metaAdLibraryUrl, setMetaAdLibraryUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, metaAdLibraryUrl, websiteUrl })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("competitorSaveError"));
      setName("");
      setMetaAdLibraryUrl("");
      setWebsiteUrl("");
      toast.success(t("competitorSaved"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("competitorSaveError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
      <label className="grid gap-1 text-xs text-white/55">Name<Input value={name} onChange={(event) => setName(event.target.value)} className="h-9" /></label>
      <label className="grid gap-1 text-xs text-white/55">Website<Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className="h-9" /></label>
      <label className="grid gap-1 text-xs text-white/55">Ad Library Link<Input value={metaAdLibraryUrl} onChange={(event) => setMetaAdLibraryUrl(event.target.value)} className="h-9" /></label>
      <Button type="button" disabled={loading || pending} onClick={submit}>{tCommon("save")}</Button>
    </div>
  );
}

export function CompetitorSourceForm({ clientId, competitors }: Props) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [competitorId, setCompetitorId] = useState("none");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitorId: competitorId === "none" ? null : competitorId, url })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("sourceSaveError"));
      setUrl("");
      toast.success(t("sourceSaved"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sourceSaveError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2 md:grid-cols-[220px_1fr_auto] md:items-end">
      <label className="grid gap-1 text-xs text-white/55">Competitor
        <Select value={competitorId} onValueChange={setCompetitorId}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("unassigned")}</SelectItem>
            {competitors.map((competitor) => <SelectItem key={competitor.id} value={competitor.id}>{competitor.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-white/55">Meta Ad Library Link<Input value={url} onChange={(event) => setUrl(event.target.value)} className="h-9" /></label>
      <Button type="button" disabled={loading || pending} onClick={submit}>{t("saveLink")}</Button>
    </div>
  );
}

export function CompetitorCreativeForm({ clientId, competitors }: Props) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [competitorId, setCompetitorId] = useState("none");
  const [format, setFormat] = useState("reel");
  const [sourceUrl, setSourceUrl] = useState("");
  const [hook, setHook] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [reachMin, setReachMin] = useState("");
  const [reachMax, setReachMax] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/creatives`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitorId: competitorId === "none" ? null : competitorId,
          format,
          sourceUrl,
          hook,
          primaryText,
          headline,
          reachMin,
          reachMax,
          startedAt,
          endedAt,
          imageUrl
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("creativeSaveError"));
      setSourceUrl("");
      setHook("");
      setPrimaryText("");
      setHeadline("");
      setReachMin("");
      setReachMax("");
      setStartedAt("");
      setEndedAt("");
      setImageUrl("");
      toast.success(t("creativeSaved"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("creativeSaveError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <label className="grid gap-1 text-xs text-white/55">Competitor
          <Select value={competitorId} onValueChange={setCompetitorId}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("unassigned")}</SelectItem>
              {competitors.map((competitor) => <SelectItem key={competitor.id} value={competitor.id}>{competitor.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-white/55">Format
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reel">Reel</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="static">Static</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-white/55">Reach Min<Input value={reachMin} onChange={(event) => setReachMin(event.target.value)} inputMode="numeric" className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Reach Max<Input value={reachMax} onChange={(event) => setReachMax(event.target.value)} inputMode="numeric" className="h-9" /></label>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="grid gap-1 text-xs text-white/55">{t("startDate")}<Input value={startedAt} onChange={(event) => setStartedAt(event.target.value)} placeholder="YYYY-MM-DD" className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">{t("endDate")}<Input value={endedAt} onChange={(event) => setEndedAt(event.target.value)} placeholder={t("optionalPlaceholder")} className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Asset URL<Input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="h-9" /></label>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-white/55">Ad Library URL<Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Hook<Input value={hook} onChange={(event) => setHook(event.target.value)} className="h-9" /></label>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-white/55">Headline<Input value={headline} onChange={(event) => setHeadline(event.target.value)} className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Primary Text<Input value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} className="h-9" /></label>
      </div>
      <Button type="button" disabled={loading || pending} onClick={submit}>{t("saveCreative")}</Button>
    </div>
  );
}

export function CompetitorAnalyzeButton({ clientId, creativeId }: { clientId: string; creativeId: string }) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/creatives/${creativeId}/analyze`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("analyzeError"));
      toast.success(t("creativeAnalyzed"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("analyzeError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="border-herb-border" disabled={loading || pending} onClick={analyze}>
      <Sparkles className="mr-2 h-4 w-4" />
      {t("analyze")}
    </Button>
  );
}

export function CompetitorBulkAnalyzeButton({ clientId, creativeIds, label }: { clientId: string; creativeIds: string[]; label?: string }) {
  const t = useTranslations("competitors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<BulkCompetitorAnalysisStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const previousStatusRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/competitors/creatives/bulk-analyze`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    setStatus(result.status ?? null);
  }, [clientId]);

  const kickWorker = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      await fetch(`/api/clients/${clientId}/competitors/creatives/bulk-analyze/process`, { method: "POST" });
    } finally {
      processingRef.current = false;
    }
  }, [clientId]);

  useEffect(() => {
    loadStatus().catch(() => undefined);
  }, [loadStatus]);

  useEffect(() => {
    if (!isActiveBulkStatus(status?.status)) return;

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

    if (previousStatus && isActiveBulkStatus(previousStatus) && !isActiveBulkStatus(status.status)) {
      if (status.failedItems > 0) toast.warning(t("bulkDoneWithErrors", { count: status.failedItems }));
      else toast.success(t("bulkDone"));
      startTransition(() => router.refresh());
    }
  }, [router, status, t]);

  async function analyzeAll() {
    if (creativeIds.length === 0) return;
    const confirmed = window.confirm(t("bulkConfirm", { count: creativeIds.length }));
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/creatives/bulk-analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creativeIds })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("bulkError"));
      setStatus(result.status ?? null);
      toast.success(t("bulkStarted"));
      kickWorker().catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("bulkError"));
    } finally {
      setLoading(false);
    }
  }

  if (isActiveBulkStatus(status?.status)) {
    const pausedUntil = status?.pauseUntil ? new Date(status.pauseUntil).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : null;
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-white md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">{t("bulkRunning")}</p>
          <p className="mt-1 text-xs text-white/60">
            {t("bulkProgress", { processed: status.processedItems, total: status.totalItems, percent: status.percent })}
            {status.failedItems > 0 ? t("bulkFailedSuffix", { count: status.failedItems }) : ""}
            {pausedUntil ? t("bulkPausedSuffix", { time: pausedUntil }) : ""}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="border-herb-border" disabled={loading || isPending} onClick={() => loadStatus().catch(() => undefined)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {tCommon("refresh")}
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" className="border-herb-border" disabled={loading || creativeIds.length === 0} onClick={analyzeAll}>
      {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
      {label ?? t("analyzeAllAds")} ({creativeIds.length})
    </Button>
  );
}

export function CompetitorCrawlToggle({ clientId, competitorId, enabled }: { clientId: string; competitorId: string; enabled: boolean }) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function update(nextEnabled: boolean) {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/${competitorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ crawlEnabled: nextEnabled })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("settingsSaveError"));
      toast.success(nextEnabled ? t("crawlConnectedToast") : t("crawlDisconnectedToast"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settingsSaveError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-white">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={enabled}
        disabled={loading || pending}
        onChange={(event) => update(event.target.checked)}
      />
      {enabled ? t("crawlConnected") : t("dontCrawl")}
    </label>
  );
}

export function CompetitorSourceCrawlButton({ clientId, sourceId, status }: { clientId: string; sourceId: string; status: string }) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const disabled = loading || pending || status === "running";

  async function crawl() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/sources/${sourceId}/crawl`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("crawlError"));
      toast.success(t("crawlStarted"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("crawlError"));
      startTransition(() => router.refresh());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="border-herb-border" disabled={disabled} onClick={crawl}>
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading || status === "running" ? t("crawlRunningLabel") : t("startCrawl")}
    </Button>
  );
}
