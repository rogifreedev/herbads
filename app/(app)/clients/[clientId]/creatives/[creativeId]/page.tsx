import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Play } from "lucide-react";
import { CreativeAnalysisButton } from "@/components/creative-analysis-button";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { CreativeEmotionRadar, hasEmotionScores } from "@/components/creative-emotion-radar";
import { CreativeTranscriptButton } from "@/components/creative-transcript-button";
import { CreativeTypeBadge } from "@/components/creative-type-badge";
import { FunnelStageBadge } from "@/components/funnel-stage-badge";
import { KpiHelp } from "@/components/kpi-help";
import { LinkedAdsDataTable } from "@/components/linked-ads-data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLatestCreativeAnalysis } from "@/lib/creative-ai";
import { getClientCreativeDetail } from "@/lib/creatives";
import type { CreativePerformanceScore } from "@/lib/creative-score";
import { formatCurrency, formatDate, formatDecimal, formatNumber, formatPercent } from "@/lib/metrics";
import { getHookTranscript, getLatestCreativeVideoTranscript } from "@/lib/video-transcripts";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateParam(value: string | string[] | undefined) {
  const normalized = firstParam(value)?.trim();
  return normalized && isDateParam(normalized) ? normalized : null;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days + 1);
  return formatDateInput(date);
}

function resolveDateFilters(searchParams: SearchParams) {
  const hasExplicitDateRange = Boolean(firstParam(searchParams.since) || firstParam(searchParams.until));
  const isAllRange = firstParam(searchParams.range) === "all";
  const since = isAllRange ? null : dateParam(searchParams.since) ?? (hasExplicitDateRange ? null : dateDaysAgo(30));
  const until = isAllRange ? null : dateParam(searchParams.until) ?? (hasExplicitDateRange ? null : formatDateInput(new Date()));
  const dateError = since && until && since > until ? "Startdatum darf nicht nach dem Enddatum liegen." : null;
  return { since, until, dateError };
}

export default async function CreativeDetailPage({ params, searchParams }: { params: Promise<{ clientId: string; creativeId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ clientId, creativeId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const dateFilters = resolveDateFilters(resolvedSearchParams);
  const activeDateRange = dateFilters.dateError ? undefined : dateFilters;
  const [{ creative, error }, { analysis, error: analysisError }, { transcript, error: transcriptError }] = await Promise.all([
    getClientCreativeDetail(clientId, creativeId, activeDateRange),
    getLatestCreativeAnalysis(clientId, creativeId),
    getLatestCreativeVideoTranscript(clientId, creativeId)
  ]);

  if (!creative) {
    return (
      <Alert variant="warning"><AlertDescription>{error ?? "Creative wurde nicht gefunden."}</AlertDescription></Alert>
    );
  }

  const hookTranscript = getHookTranscript(transcript);
  const showTranscriptCard = Boolean(creative.videoId || creative.videoUrl || creative.videoEmbedUrl || transcript);
  const periodLabel =
    !dateFilters.dateError && (dateFilters.since || dateFilters.until)
      ? `KPI-Zeitraum: ${dateFilters.since ? `ab ${formatDate(dateFilters.since)}` : "ab Anfang"} bis ${dateFilters.until ? formatDate(dateFilters.until) : "heute"}`
      : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Creative Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top,rgba(229,31,118,0.28),transparent_42%),#1f2937]">
            {creative.videoUrl ? (
              <video controls playsInline poster={creative.thumbnailUrl ?? creative.imageUrl ?? undefined} className="aspect-[4/5] w-full bg-black object-contain">
                <source src={creative.videoUrl} />
              </video>
            ) : creative.videoEmbedUrl ? (
              <iframe
                src={creative.videoEmbedUrl}
                className="aspect-[4/5] w-full border-0 bg-black"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
                title={creative.name}
              />
            ) : creative.thumbnailUrl || creative.imageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creative.thumbnailUrl ?? creative.imageUrl ?? ""} alt="" className="aspect-[4/5] w-full object-cover" />
                {creative.videoId ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30">
                      <Play className="ml-1 h-7 w-7 fill-current" />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex aspect-[4/5] items-end p-5">
                <p className="font-heading text-3xl">{creative.type}</p>
              </div>
            )}
          </div>
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              <CreativeTypeBadge type={creative.type} />
              <Badge variant={creative.status === "ACTIVE" ? "success" : "secondary"}>{creative.status}</Badge>
            </div>
            <p className="font-mono text-xs text-white/45">{creative.metaCreativeId}</p>
            {creative.landingUrl ? (
              <Link href={creative.landingUrl} target="_blank" className="block truncate text-sm text-primary hover:underline">
                {creative.landingUrl}
              </Link>
            ) : null}
            {creative.videoPermalinkUrl ? (
              <Button asChild variant="outline" className="w-full border-herb-border">
                <Link href={creative.videoPermalinkUrl} target="_blank">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Video auf Meta ansehen
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>{creative.name}</CardTitle>
              {periodLabel ? <p className="mt-2 text-sm text-white/50">{periodLabel}</p> : null}
            </div>
            <CreativeDateRangePicker defaultDays={30} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {dateFilters.dateError ? <Alert variant="warning"><AlertDescription>{dateFilters.dateError}</AlertDescription></Alert> : null}
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Metric label="Creative Score" value={`${creative.performanceScore.score}/100`} highlight />
            <Metric label="Spend" value={formatCurrency(creative.metrics.spend)} />
            <Metric label="ROAS" value={formatDecimal(creative.metrics.roas)} />
            <Metric label="Conversions" value={formatNumber(creative.metrics.purchases)} />
            <Metric label="Conv. Value" value={formatCurrency(creative.metrics.purchaseValue)} />
            <Metric label="Outbound CVR" value={formatPercent(creative.metrics.outboundCvr)} />
            <Metric label="CTR" value={formatPercent(creative.metrics.ctr)} />
            <Metric label="CPC" value={formatNullableCurrency(creative.metrics.cpc)} />
            <Metric label="CPM" value={formatNullableCurrency(creative.metrics.cpm)} />
            <Metric label="CPA" value={formatNullableCurrency(creative.metrics.costPerPurchase)} />
            <Metric label="Reach" value={formatNumber(creative.metrics.reach)} />
            <Metric label="Impressions" value={formatNumber(creative.metrics.impressions)} />
            <Metric label="Frequency" value={formatDecimal(creative.metrics.frequency)} />
            <Metric label="Hookrate" value={formatPercent(creative.metrics.hookRate)} />
            <Metric label="Holdrate" value={formatPercent(creative.metrics.holdRate)} />
            <Metric label="Outbound Clicks" value={formatNumber(creative.metrics.outboundClicks)} />
          </div>
          <PerformanceScoreBreakdown score={creative.performanceScore} />
          <div className="grid gap-3 md:grid-cols-2">
            <InfoBox label="Landingpage URL">
              {creative.landingUrl ? (
                <Link href={creative.landingUrl} target="_blank" className="break-all text-primary hover:underline">
                  {creative.landingUrl}
                </Link>
              ) : (
                <span>Keine Landingpage URL gespeichert.</span>
              )}
            </InfoBox>
            <InfoBox label="Erstmalig aktiv">
              <span>{formatDate(creative.firstActiveDate)}</span>
            </InfoBox>
          </div>
          <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/70">
            <p className="font-medium text-white">Creative Copy</p>
            <p className="mt-2">{creative.body || creative.title || "Keine Copy im Creative gespeichert."}</p>
          </div>
          {showTranscriptCard ? (
            <Card className="border-herb-border bg-black/20 shadow-none">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Video Transcript</CardTitle>
                    <p className="mt-2 text-xs text-white/50">
                      {transcript?.status === "completed"
                        ? `Zuletzt transkribiert: ${new Date(transcript.updatedAt).toLocaleString("de-DE")}`
                        : "Noch kein Transcript fuer dieses Video gespeichert."}
                    </p>
                  </div>
                  <CreativeTranscriptButton clientId={clientId} creativeId={creative.id} hasTranscript={transcript?.status === "completed"} canTranscribe={Boolean(creative.videoUrl || creative.videoId)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-white/70">
                {transcriptError ? <Alert variant="warning"><AlertDescription>{transcriptError}</AlertDescription></Alert> : null}
                {!creative.videoUrl && creative.videoId ? <p className="rounded-lg border border-herb-border bg-black/25 p-3 text-white/60">Kein direkter Video-Download gespeichert. Beim Transkribieren wird die Video-Quelle ueber die Meta Video-ID nachgeladen.</p> : null}
                {!creative.videoUrl && !creative.videoId ? <Alert variant="warning"><AlertDescription>Keine Video-Quelle fuer dieses Creative gespeichert.</AlertDescription></Alert> : null}
                {transcript?.status === "failed" ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-100">{transcript.errorMessage ?? "Transkription fehlgeschlagen."}</p> : null}
                {transcript?.status === "processing" ? <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-white">Transkription laeuft. Aktualisiere die Seite in wenigen Sekunden.</p> : null}
                {transcript?.status === "completed" && transcript.transcript ? (
                  <>
                    <div className="flex flex-wrap gap-2 text-xs text-white/50">
                      <span className="rounded-full border border-herb-border bg-black/25 px-3 py-1">Provider {transcript.provider}</span>
                      <span className="rounded-full border border-herb-border bg-black/25 px-3 py-1">Model {transcript.model}</span>
                      {transcript.language ? <span className="rounded-full border border-herb-border bg-black/25 px-3 py-1">Sprache {transcript.language}</span> : null}
                      {transcript.durationSeconds !== null ? <span className="rounded-full border border-herb-border bg-black/25 px-3 py-1">Dauer {formatSeconds(transcript.durationSeconds)}</span> : null}
                    </div>
                    {hookTranscript ? (
                      <div className="rounded-xl border border-primary/25 bg-primary/10 p-4">
                        <p className="font-medium text-white">Hook-Auszug</p>
                        <p className="mt-2">{hookTranscript}</p>
                      </div>
                    ) : null}
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-herb-border bg-black/30 p-4">
                      {transcript.transcript}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card className="border-primary/30 bg-primary/10 shadow-none">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>AI Creative Analyse</CardTitle>
                  <p className="mt-2 text-xs text-white/50">
                    {analysis ? `Zuletzt analysiert: ${new Date(analysis.createdAt).toLocaleString("de-DE")}` : "Noch keine AI Analyse fuer dieses Creative."}
                  </p>
                </div>
                <CreativeAnalysisButton clientId={clientId} creativeId={creative.id} hasAnalysis={Boolean(analysis)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {analysisError ? <Alert variant="warning"><AlertDescription>{analysisError}</AlertDescription></Alert> : null}
              {analysis ? (
                <>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Score label="Audience" value={analysis.targetAudienceFitScore} />
                    <Score label="Brand" value={analysis.brandFitScore} />
                    <Score label="Clarity" value={analysis.clarityScore} />
                    <Score label="Scrollstopper" value={analysis.scrollstopperScore} />
                    <Score label="CTA" value={analysis.ctaScore} />
                  </div>
                  {hasEmotionScores(analysis.emotionScores) ? (
                    <div>
                      <p className="mb-3 font-medium text-white">Emotionen</p>
                      <CreativeEmotionRadar scores={analysis.emotionScores} />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/60">
                      <p className="font-medium text-white">Emotionen</p>
                      <p className="mt-2">Noch keine Emotion-Scores gespeichert. Klicke auf Neu analysieren, um das Netzdiagramm zu erzeugen.</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/75">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">Funnel Stage</p>
                      <FunnelStageBadge stage={analysis.funnelStage} />
                    </div>
                    <p className="mt-2">{analysis.funnelReason || "Keine Funnel-Begruendung gespeichert."}</p>
                  </div>
                  <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/75">
                    <p className="font-medium text-white">Zusammenfassung</p>
                    <p className="mt-2">{analysis.summary || "Keine Zusammenfassung gespeichert."}</p>
                  </div>
                  {analysis.hook ? (
                    <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/75">
                      <p className="font-medium text-white">Hook</p>
                      <p className="mt-2">{analysis.hook}</p>
                      {analysis.hookExplanation ? <p className="mt-3 text-white/55">{analysis.hookExplanation}</p> : null}
                    </div>
                  ) : null}
                  {analysis.videoStructure ? (
                    <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/75">
                      <p className="font-medium text-white">Video Struktur</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <VideoStructureSection title="Hook" section={analysis.videoStructure.hook} />
                        <VideoStructureSection title="Body" section={analysis.videoStructure.body} />
                        <VideoStructureSection title="Ending" section={analysis.videoStructure.ending} />
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <AnalysisList title="Risiken" items={analysis.risks} empty="Keine Risiken erkannt." />
                    <AnalysisList title="Hypothesen" items={analysis.hypotheses} empty="Keine Hypothesen gespeichert." />
                  </div>
                  <AnalysisList title="Empfehlungen" items={analysis.recommendations} empty="Keine Empfehlungen gespeichert." />
                  {Object.keys(analysis.visualElements).length > 0 ? (
                    <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/70">
                      <p className="font-medium text-white">Visuelle Elemente</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {Object.entries(analysis.visualElements).map(([key, value]) => (
                          <p key={key} className="rounded-lg bg-white/[0.03] px-3 py-2">
                            <span className="text-white/45">{key}: </span>
                            <span>{typeof value === "string" || typeof value === "number" ? value : JSON.stringify(value)}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {analysis.detectedText ? (
                    <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/70">
                      <p className="font-medium text-white">Erkannter Text</p>
                      <p className="mt-2">{analysis.detectedText}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm leading-6 text-white/65">
                  Starte eine Analyse, um Hook, Brand Fit, Zielgruppenfit, Risiken und konkrete Hypothesen anhand Kundenprofil, Wissensdatenbank, Creative-Daten und Performance zu erzeugen.
                </p>
              )}
            </CardContent>
          </Card>
          <div>
            <h3 className="font-heading text-2xl">Verknuepfte Ads</h3>
            <div className="mt-3">
              <LinkedAdsDataTable ads={creative.ads} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl border border-primary/40 bg-primary/10 p-3" : "rounded-xl border border-herb-border bg-black/20 p-3"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-white/45">{label}</p>
        <KpiHelp label={label} />
      </div>
      <p className={highlight ? "mt-2 font-heading text-2xl text-primary" : "mt-2 font-heading text-2xl text-white"}>{value}</p>
    </div>
  );
}

function PerformanceScoreBreakdown({ score }: { score: CreativePerformanceScore }) {
  const components = [
    ["ROAS", score.components.roas],
    ["CPA", score.components.cpa],
    ["CTR", score.components.ctr],
    ["Outbound CVR", score.components.outboundCvr],
    ["Hookrate", score.components.hookRate],
    ["Holdrate", score.components.holdRate],
    ["Conversion Volume", score.components.conversionVolume],
    ["Datenqualitaet", score.components.dataQuality]
  ] as const;

  return (
    <div className="overflow-hidden rounded-2xl border border-herb-border bg-black/20 text-sm text-white/70">
      <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
        <div className="border-b border-herb-border bg-[radial-gradient(circle_at_top,rgba(229,31,118,0.18),transparent_48%),rgba(255,255,255,0.03)] p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">Performance Score</p>
            <KpiHelp label="Creative Score" />
          </div>
          <div className="mt-5 flex items-end gap-2">
            <span className="font-heading text-6xl leading-none text-primary">{score.score}</span>
            <span className="pb-2 font-mono text-sm text-white/40">/100</span>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-white/45">Confidence</span>
              <span className="font-mono text-white/70">{score.confidence}%</span>
            </div>
            <ScoreBar value={score.confidence} tone="muted" />
          </div>
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-medium text-white">Score Zusammensetzung</p>
              <p className="mt-1 text-xs text-white/45">Normalisierte Komponenten fuer den aktuell gewaehlten KPI-Zeitraum.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-x-5 gap-y-3 xl:grid-cols-2">
            {components.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-xs text-white/55">{label}</p>
                    <KpiHelp label={label} />
                  </div>
                  <p className="font-mono text-xs text-white/70">{value === null ? "–" : `${value}/100`}</p>
                </div>
                <ScoreBar value={value} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ value, tone = "primary" }: { value: number | null; tone?: "primary" | "muted" }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
      <div className={tone === "primary" ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-white/45"} style={{ width: `${width}%` }} />
    </div>
  );
}

function formatNullableCurrency(value: number | null) {
  return value === null ? "–" : formatCurrency(value, 2);
}

function InfoBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/70">
      <p className="font-medium text-white">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-2 font-heading text-2xl text-white">{value === null ? "–" : `${value}/100`}</p>
    </div>
  );
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function AnalysisList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm leading-6 text-white/75">
      <p className="font-medium text-white">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-white/55">{empty}</p>
      )}
    </div>
  );
}

function VideoStructureSection({ title, section }: { title: string; section: { text: string; analysis: string; score: number | null } }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-white">{title}</p>
        {section.score !== null ? <Badge variant="secondary">{section.score}/100</Badge> : null}
      </div>
      <p className="mt-2 text-white/75">{section.text || "Kein Segment erkannt."}</p>
      {section.analysis ? <p className="mt-3 text-white/50">{section.analysis}</p> : null}
    </div>
  );
}
