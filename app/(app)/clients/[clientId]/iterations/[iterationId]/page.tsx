import Link from "next/link";
import { ArrowLeft, ExternalLink, Play } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AdIterationStatusSelect } from "@/components/ad-iteration-status-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdIterationDetail, iterationPerformanceLine, type AdIteration } from "@/lib/creative-iterations";
import { formatDate, formatNumber } from "@/lib/metrics";

export default async function IterationDetailPage({ params }: { params: Promise<{ clientId: string; iterationId: string }> }) {
  const { clientId, iterationId } = await params;
  const t = await getTranslations("iterations");
  const tCommon = await getTranslations("common");
  const { iteration, error } = await getAdIterationDetail(clientId, iterationId);

  if (!iteration) {
    return <Alert variant="warning"><AlertDescription>{error ?? t("notFound")}</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" className="-ml-3 text-white/60 hover:text-white">
            <Link href={`/clients/${clientId}/iterations?tab=${iteration.format === "video" ? "videos" : "statics"}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backToIterations")}
            </Link>
          </Button>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant={iteration.format === "video" ? "default" : "secondary"}>{iteration.format === "video" ? "Video" : "Static"}</Badge>
            {iteration.angle ? <Badge variant="outline">{iteration.angle}</Badge> : null}
            {iteration.score !== null ? <Badge variant="success">Score {formatNumber(iteration.score)}/100</Badge> : null}
          </div>
          <h2 className="mt-3 font-heading text-4xl text-white">{iteration.title}</h2>
          <p className="mt-2 text-sm text-white/50">{t("createdFromTemplate", { date: formatDate(iteration.createdAt), name: iteration.sourceCreativeName })}</p>
        </div>
        <div className="w-full max-w-xs">
          <AdIterationStatusSelect clientId={clientId} iterationId={iteration.id} status={iteration.status} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>{t("templateImage")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <IterationSourcePreview iteration={iteration} />
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{iteration.sourceCreativeType}</Badge>
                <Badge variant="secondary">{iterationPerformanceLine(iteration)}</Badge>
              </div>
              <Link href={iteration.sourceCreativeHref} className="group flex items-center gap-2 text-primary hover:text-white">
                <span className="line-clamp-2">{iteration.sourceCreativeName}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 transition group-hover:opacity-100" />
              </Link>
              {iteration.sourceCreativeLandingUrl ? (
                <Link href={iteration.sourceCreativeLandingUrl} target="_blank" className="block break-all text-sm text-white/55 hover:text-primary">
                  {iteration.sourceCreativeLandingUrl}
                </Link>
              ) : null}
            </div>
            {iteration.sourceCreativeBody || iteration.sourceCreativeTitle ? (
              <div className="rounded-xl border border-herb-border bg-black/25 p-4 text-sm leading-6 text-white/65">
                <p className="font-medium text-white">{t("templateCopy")}</p>
                <p className="mt-2 whitespace-pre-wrap">{iteration.sourceCreativeBody ?? iteration.sourceCreativeTitle}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <CardTitle>{t("newInstructionTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailBlock label={t("descriptionLabel")} value={iteration.description} />
              <DetailBlock label={t("thesisLabel")} value={iteration.thesis} />
              <DetailBlock label={t("whyLabel")} value={iteration.rationale} />
              {iteration.format === "static" ? (
                <DetailBlock label="Text Overlay" value={iteration.textOverlay} highlight />
              ) : (
                <>
                  <DetailBlock label={t("newHookLabel")} value={iteration.hook} highlight />
                  <DetailBlock label="Script" value={iteration.script} />
                </>
              )}
              <DetailBlock label={t("productionNotesLabel")} value={iteration.productionNotes} />
            </CardContent>
          </Card>

          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <CardTitle>{t("performanceContext")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <SnapshotMetric label={t("sourceLabel")} value={iteration.sourceCreativeName} />
              <SnapshotMetric label="Performance" value={iterationPerformanceLine(iteration)} />
              <SnapshotMetric label={tCommon("status")} value={iteration.status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function IterationSourcePreview({ iteration }: { iteration: AdIteration }) {
  const imageUrl = iteration.sourceCreativeThumbnailUrl ?? iteration.sourceCreativeImageUrl;

  return (
    <div className="overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,rgba(229,31,118,0.22),transparent_42%),#1f2937]">
      {iteration.sourceCreativeVideoUrl ? (
        <video controls playsInline poster={imageUrl ?? undefined} className="aspect-[4/5] w-full bg-black object-contain">
          <source src={iteration.sourceCreativeVideoUrl} />
        </video>
      ) : iteration.sourceCreativeVideoEmbedUrl ? (
        <iframe
          src={iteration.sourceCreativeVideoEmbedUrl}
          className="aspect-[4/5] w-full border-0 bg-black"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          title={iteration.sourceCreativeName}
        />
      ) : imageUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
          {iteration.format === "static" && iteration.textOverlay ? (
            <div className="absolute inset-x-4 bottom-4 rounded-xl bg-black/70 p-3 text-center shadow-xl backdrop-blur-sm">
              <p className="whitespace-pre-wrap font-heading text-2xl leading-tight text-white">{iteration.textOverlay}</p>
            </div>
          ) : null}
          {iteration.sourceCreativeVideoPermalinkUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30">
                <Play className="ml-1 h-6 w-6 fill-current" />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex aspect-[4/5] items-end p-5">
          <p className="font-heading text-3xl text-white/70">{iteration.sourceCreativeType}</p>
        </div>
      )}
    </div>
  );
}

function DetailBlock({ label, value, highlight = false }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl border border-primary/35 bg-primary/10 p-4" : "rounded-xl border border-herb-border bg-black/20 p-4"}>
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">{value || "-"}</p>
    </div>
  );
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 line-clamp-3 text-sm text-white">{value}</p>
    </div>
  );
}
