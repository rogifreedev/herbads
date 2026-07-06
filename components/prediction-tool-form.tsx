"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileVideo, ImageIcon, Sparkles, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CreativePredictionResult } from "@/lib/creative-predictions";
import type { Translator } from "@/lib/i18n-types";
import { cn } from "@/lib/utils";

type PredictionFormat = "static" | "video";
type ExtractedFrame = { label: string; dataUrl: string; timeSeconds: number | null };

export function PredictionToolForm({ clientId }: { clientId: string }) {
  const t = useTranslations("predictionTool");
  const [format, setFormat] = useState<PredictionFormat>("static");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [result, setResult] = useState<CreativePredictionResult | null>(null);
  const [analysisHref, setAnalysisHref] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const fileTypeLabel = useMemo(() => {
    if (!file) return t("noFileSelected");
    return `${file.name} · ${Math.round(file.size / 1024)} KB`;
  }, [file, t]);

  async function updateFile(nextFile: File | null) {
    setResult(null);
    setAnalysisHref(null);
    setFrames([]);
    setFile(nextFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!nextFile) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(nextFile);
    setPreviewUrl(nextPreviewUrl);
    setFrameLoading(true);
    try {
      if (format === "video") {
        setFrames(await extractVideoFrames(nextPreviewUrl, t));
      } else {
        setFrames([{ label: "Creative", dataUrl: await readImageDataUrl(nextFile, t), timeSeconds: null }]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("frameExtractError"));
    } finally {
      setFrameLoading(false);
    }
  }

  async function submit() {
    if (!file) {
      toast.error(t("uploadFirstError"));
      return;
    }
    if (frames.length === 0) {
      toast.error(t("noFrameError"));
      return;
    }

    setLoading(true);
    setResult(null);
    setAnalysisHref(null);
    try {
      const formData = new FormData();
      formData.append("format", format);
      formData.append("file", file);
      formData.append("frames", JSON.stringify(frames));
      formData.append("primaryText", primaryText);
      formData.append("headline", headline);
      formData.append("landingUrl", landingUrl);

      const response = await fetch(`/api/clients/${clientId}/prediction-tool/analyze`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("createError"));
      setResult(payload.result as CreativePredictionResult);
      setAnalysisHref(typeof payload.analysis?.detailHref === "string" ? payload.analysis.detailHref : null);
      toast.success(t("created"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("createError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Creative Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label>Format</Label>
            <Select
              value={format}
              onValueChange={(value) => {
                setFormat(value as PredictionFormat);
                setFile(null);
                setFrames([]);
                setResult(null);
                setAnalysisHref(null);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="static">Static</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-herb-border bg-black/20 p-6 text-center transition hover:border-primary/60">
            <UploadCloud className="h-8 w-8 text-primary" />
            <span className="text-sm font-medium text-white">{fileTypeLabel}</span>
            <span className="text-xs text-white/45">{format === "video" ? t("videoFormats") : t("imageFormats")}</span>
            <input
              type="file"
              accept={format === "video" ? "video/*" : "image/*"}
              className="hidden"
              onChange={(event) => updateFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {previewUrl ? (
            <div className="overflow-hidden rounded-xl border border-herb-border bg-black/30">
              {format === "video" ? (
                <video src={previewUrl} controls playsInline className="aspect-[4/5] w-full bg-black object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="aspect-[4/5] w-full object-contain" />
              )}
            </div>
          ) : null}

          {frames.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {frames.map((frame) => (
                <div key={`${frame.label}-${frame.timeSeconds ?? "image"}`} className="overflow-hidden rounded-lg border border-herb-border bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.dataUrl} alt="" className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
          ) : frameLoading ? (
            <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-white/75">{t("extractingFrames")}</p>
          ) : null}

          <div className="grid gap-3">
            <Label>Headline / Overlay</Label>
            <Input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder={t("optionalPlaceholder")} />
            <Label>Primary Text / Caption</Label>
            <Textarea value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} placeholder={t("optionalPlaceholder")} />
            <Label>Landingpage</Label>
            <Input value={landingUrl} onChange={(event) => setLandingUrl(event.target.value)} placeholder="https://..." />
          </div>

          <Button type="button" variant="gradient" className="w-full" disabled={loading || frameLoading || !file} onClick={submit}>
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? (format === "video" ? t("transcribingScoring") : t("scoring")) : t("computeScore")}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {result ? <PredictionResultView result={result} historyHref={analysisHref} /> : <PredictionEmptyState format={format} />}
      </div>
    </div>
  );
}

function PredictionEmptyState({ format }: { format: PredictionFormat }) {
  const t = useTranslations("predictionTool");

  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-herb-border bg-black/20 text-primary">
          {format === "video" ? <FileVideo className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
        </div>
        <h3 className="mt-5 font-heading text-2xl text-white">{t("readyTitle")}</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-white/55">
          {format === "video" ? t("readyVideoDescription") : t("readyStaticDescription")}
        </p>
      </CardContent>
    </Card>
  );
}

function PredictionResultView({ result, historyHref }: { result: CreativePredictionResult; historyHref: string | null }) {
  const t = useTranslations("predictionTool");
  const tCommon = useTranslations("common");

  return (
    <>
      <Card className="border-herb-border bg-herb-surface/90">
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
          <div className="rounded-xl border border-herb-border bg-black/20 p-5 text-center">
            <p className="text-xs uppercase tracking-[0.16em] text-white/45">Quality Score</p>
            <p className={cn("mt-3 font-heading text-7xl", result.band === "high" ? "text-emerald-300" : result.band === "medium" ? "text-primary" : "text-amber-200")}>{result.qualityScore}</p>
            <p className="mt-2 text-sm text-white/55">Confidence {result.confidence}%</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary" style={{ width: `${result.qualityScore}%` }} />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{result.format === "video" ? "Video" : "Static"}</Badge>
              <Badge variant="outline">{result.angle}</Badge>
              <Badge variant="secondary">{result.band}</Badge>
            </div>
            <h3 className="font-heading text-3xl text-white">{result.ai.summary || result.fileName}</h3>
            <p className="text-sm leading-6 text-white/60">{result.ai.conversionReason || result.ai.thumbstopReason}</p>
            {historyHref ? (
              <Button asChild variant="outline" className="border-herb-border text-white hover:text-white">
                <Link href={historyHref}>
                  {t("openInHistory")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-5">
        <ScoreCard label="AI Quality" value={result.components.aiQuality} />
        <ScoreCard label="Account Fit" value={result.components.accountFit} />
        <ScoreCard label="Competitor Fit" value={result.components.competitorFit} />
        <ScoreCard label="Format Ready" value={result.components.formatReadiness} />
        <ScoreCard label="Risk" value={result.components.riskAdjustment} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader><CardTitle>Hook & Script</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <InfoBlock label="Hook" value={result.hook} highlight />
            {result.format === "video" ? <InfoBlock label="Script" value={result.script} /> : <InfoBlock label="Detected Text" value={result.ai.detectedText} />}
            {result.transcript ? <InfoBlock label="Transcript" value={result.transcript} tall /> : null}
          </CardContent>
        </Card>

        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader><CardTitle>{tCommon("whyTitle")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ListBlock title="Rationale" items={result.rationale} />
            <ListBlock title={t("strengthsTitle")} items={result.ai.strengths} />
            <ListBlock title={tCommon("risksTitle")} items={result.ai.risks} />
            <ListBlock title={t("improvementsTitle")} items={result.ai.recommendations} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader><CardTitle>Benchmarks</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <BenchmarkBlock title="Viktor Kofler Account" lines={[
            `${result.benchmarks.account.creativeCount} Creatives`,
            `Avg Score ${result.benchmarks.account.avgScore}/100`,
            `Winner Score ${result.benchmarks.account.winnerScore}/100`
          ]} />
          <BenchmarkBlock title="Matched Angle" lines={result.benchmarks.matchedAngle ? [
            result.benchmarks.matchedAngle.angle,
            `Score ${result.benchmarks.matchedAngle.score}/100`,
            `${Math.round(result.benchmarks.matchedAngle.spend)} EUR Spend`
          ] : [t("noHistoricalMatch")]} />
          <BenchmarkBlock title="Competitor Signal" lines={[
            result.benchmarks.competitor.matchedAngle ?? t("noAngleMatch"),
            `${result.benchmarks.competitor.creativeCount} Creatives`,
            `${Math.round(result.benchmarks.competitor.reach)} Reach`
          ]} />
        </CardContent>
      </Card>
    </>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 font-heading text-3xl text-white">{value}</p>
    </div>
  );
}

function InfoBlock({ label, value, highlight = false, tall = false }: { label: string; value: string | null; highlight?: boolean; tall?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl border border-primary/35 bg-primary/10 p-4" : "rounded-xl border border-herb-border bg-black/20 p-4"}>
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-6 text-white", tall ? "max-h-[320px] overflow-auto pr-2 text-white/70" : "")}>{value || "-"}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{title}</p>
      <div className="mt-2 space-y-2">
        {(items.length > 0 ? items : ["-"]).map((item) => (
          <p key={item} className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm leading-5 text-white/70">{item}</p>
        ))}
      </div>
    </div>
  );
}

function BenchmarkBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4">
      <p className="font-medium text-white">{title}</p>
      <div className="mt-3 space-y-2">
        {lines.map((line) => <p key={line} className="text-sm text-white/60">{line}</p>)}
      </div>
    </div>
  );
}

function readImageDataUrl(file: File, t: Translator) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t("imageReadError")));
    reader.readAsDataURL(file);
  });
}

function waitForEvent(target: EventTarget, eventName: string, t: Translator) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(t("videoEventTimeout", { event: eventName })));
    }, 10000);
    const done = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      target.removeEventListener(eventName, done);
      target.removeEventListener("error", fail);
    };
    const fail = () => {
      cleanup();
      reject(new Error(t("videoLoadError")));
    };
    target.addEventListener(eventName, done, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

async function extractVideoFrames(videoUrl: string, t: Translator): Promise<ExtractedFrame[]> {
  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  await waitForEvent(video, "loadedmetadata", t);

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 8;
  const times = Array.from(new Set([
    Math.min(0.6, Math.max(0, duration - 0.1)),
    Math.min(3, Math.max(0, duration - 0.1)),
    Math.min(duration * 0.5, Math.max(0, duration - 0.1)),
    Math.min(Math.max(duration - 1, 0), Math.max(0, duration - 0.1))
  ].map((time) => Number(time.toFixed(2))))).slice(0, 4);

  const frames: ExtractedFrame[] = [];
  for (const time of times) {
    video.currentTime = time;
    await waitForEvent(video, "seeked", t);
    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    const scale = Math.min(1, 720 / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({ label: `${time}s`, dataUrl: canvas.toDataURL("image/jpeg", 0.76), timeSeconds: time });
  }

  return frames;
}
