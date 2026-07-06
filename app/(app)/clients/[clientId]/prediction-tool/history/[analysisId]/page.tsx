import Link from "next/link";
import { ArrowLeft, ExternalLink, ImageIcon, Video } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CreativeEmotionRadar, hasEmotionScores } from "@/components/creative-emotion-radar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCreativePredictionAnalysis, type CreativePredictionAnalysis } from "@/lib/prediction-history";
import { formatDate, formatNumber } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export default async function PredictionHistoryDetailPage({ params }: { params: Promise<{ clientId: string; analysisId: string }> }) {
  const { clientId, analysisId } = await params;
  const t = await getTranslations("predictionTool");
  const { analysis, error } = await getCreativePredictionAnalysis(clientId, analysisId);

  if (!analysis) {
    return <Alert variant="warning"><AlertDescription>{error ?? t("notFound")}</AlertDescription></Alert>;
  }

  const hasEmotions = hasEmotionScores(analysis.ai.emotionScores);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" className="-ml-3 text-white/60 hover:text-white">
            <Link href={`/clients/${clientId}/prediction-tool/history`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backToHistory")}
            </Link>
          </Button>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant={analysis.format === "video" ? "default" : "secondary"}>{analysis.format === "video" ? "Video" : "Static"}</Badge>
            {analysis.angle ? <Badge variant="outline">{analysis.angle}</Badge> : null}
            <Badge variant={analysis.band === "high" ? "success" : analysis.band === "medium" ? "warning" : "secondary"}>Score {formatNumber(analysis.qualityScore)}/100</Badge>
          </div>
          <h2 className="mt-3 font-heading text-4xl text-white">{analysis.ai.summary || analysis.fileName}</h2>
          <p className="mt-2 text-sm text-white/50">
            {t("createdAtLine", { date: formatDate(analysis.createdAt) })} · {analysis.fileName}
          </p>
        </div>
        <Button asChild variant="gradient">
          <Link href={`/clients/${clientId}/prediction-tool`}>
            {t("newAnalysis")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <CardTitle>Creative Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MainPreview analysis={analysis} />
              {analysis.frames.length > 1 ? (
                <div className="grid grid-cols-4 gap-2">
                  {analysis.frames.map((frame) => (
                    <div key={`${frame.label}-${frame.timeSeconds ?? "image"}`} className="overflow-hidden rounded-lg border border-herb-border bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frame.dataUrl} alt="" className="aspect-square w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <CardTitle>{t("uploadContextTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ContextLine label="Format" value={analysis.format === "video" ? "Video" : "Static"} />
              <ContextLine label={t("fileLabel")} value={`${analysis.fileName} · ${formatBytes(analysis.fileSize)}`} />
              <ContextLine label="Headline / Overlay" value={analysis.headline} />
              <ContextLine label="Primary Text" value={analysis.primaryText} />
              {analysis.landingUrl ? (
                <div className="rounded-xl border border-herb-border bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/40">Landingpage</p>
                  <Link href={analysis.landingUrl} target="_blank" className="mt-2 flex items-center gap-2 break-all text-sm leading-6 text-primary hover:text-white">
                    {analysis.landingUrl}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-herb-border bg-herb-surface/90">
            <CardContent className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
              <div className="rounded-xl border border-herb-border bg-black/20 p-5 text-center">
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Quality Score</p>
                <p className={cn("mt-3 font-heading text-7xl", analysis.band === "high" ? "text-emerald-300" : analysis.band === "medium" ? "text-primary" : "text-amber-200")}>{formatNumber(analysis.qualityScore)}</p>
                <p className="mt-2 text-sm text-white/55">Confidence {formatNumber(analysis.confidence)}%</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, analysis.qualityScore)}%` }} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <ScoreCard label="AI Quality" value={analysis.components.aiQuality} />
                <ScoreCard label="Account Fit" value={analysis.components.accountFit} />
                <ScoreCard label="Competitor Fit" value={analysis.components.competitorFit} />
                <ScoreCard label="Format Ready" value={analysis.components.formatReadiness} />
                <ScoreCard label="Risk" value={analysis.components.riskAdjustment} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-herb-border bg-herb-surface/90">
              <CardHeader><CardTitle>Hook & Script</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <DetailBlock label="Hook / Overlay" value={analysis.hook} highlight />
                {analysis.format === "video" ? <DetailBlock label="Script" value={analysis.script} /> : <DetailBlock label="Detected Text" value={analysis.ai.detectedText} />}
                {analysis.transcript ? <DetailBlock label="Transcript" value={analysis.transcript} tall /> : null}
              </CardContent>
            </Card>

            <Card className="border-herb-border bg-herb-surface/90">
              <CardHeader><CardTitle>{t("whyTitle")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ListBlock title="Rationale" items={analysis.rationale} />
                <ListBlock title={t("strengthsTitle")} items={analysis.ai.strengths} />
                <ListBlock title={t("risksTitle")} items={analysis.ai.risks} />
                <ListBlock title={t("improvementsTitle")} items={analysis.ai.recommendations} />
              </CardContent>
            </Card>
          </div>

          {hasEmotions ? (
            <Card className="border-herb-border bg-herb-surface/90">
              <CardHeader><CardTitle>{t("emotionsTitle")}</CardTitle></CardHeader>
              <CardContent>
                <CreativeEmotionRadar scores={analysis.ai.emotionScores} />
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader><CardTitle>Benchmarks</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <BenchmarkBlock title="Viktor Kofler Account" lines={[
                `${formatNumber(analysis.benchmarks.account.creativeCount)} Creatives`,
                `Avg Score ${formatNumber(analysis.benchmarks.account.avgScore)}/100`,
                `Winner Score ${formatNumber(analysis.benchmarks.account.winnerScore)}/100`
              ]} />
              <BenchmarkBlock title="Matched Angle" lines={analysis.benchmarks.matchedAngle ? [
                analysis.benchmarks.matchedAngle.angle,
                `Score ${formatNumber(analysis.benchmarks.matchedAngle.score)}/100`,
                `${formatNumber(Math.round(analysis.benchmarks.matchedAngle.spend))} EUR Spend`
              ] : [t("noHistoricalMatch")]} />
              <BenchmarkBlock title="Competitor Signal" lines={[
                analysis.benchmarks.competitor.matchedAngle ?? t("noAngleMatch"),
                `${formatNumber(analysis.benchmarks.competitor.creativeCount)} Creatives`,
                `${formatNumber(Math.round(analysis.benchmarks.competitor.reach))} Reach`
              ]} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MainPreview({ analysis }: { analysis: CreativePredictionAnalysis }) {
  if (analysis.previewFrame) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-herb-border bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={analysis.previewFrame.dataUrl} alt="" className="aspect-[4/5] w-full object-contain" />
        {analysis.format === "video" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30">
              <Video className="h-6 w-6" />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border border-herb-border bg-black/30 text-white/45">
      {analysis.format === "video" ? <Video className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
    </div>
  );
}

function ContextLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">{value}</p>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 whitespace-nowrap font-heading text-xl text-white">{formatNumber(value)}</p>
    </div>
  );
}

function DetailBlock({ label, value, highlight = false, tall = false }: { label: string; value: string | null; highlight?: boolean; tall?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl border border-primary/35 bg-primary/10 p-4" : "rounded-xl border border-herb-border bg-black/20 p-4"}>
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-6 text-white", tall ? "max-h-[360px] overflow-auto pr-2 text-white/70" : "")}>{value || "-"}</p>
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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${formatNumber(bytes)} B`;
}
