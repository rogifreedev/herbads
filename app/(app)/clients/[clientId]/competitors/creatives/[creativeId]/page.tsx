import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetitorAnalyzeButton } from "@/components/competitor-intelligence-actions";
import { CompetitorSectionNav } from "@/components/competitor-section-nav";
import { CreativeEmotionRadar, hasEmotionScores } from "@/components/creative-emotion-radar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { competitorCreativeStatusLabel, isCompetitorCreativeDisabled } from "@/lib/competitor-creative-status";
import { getCompetitorDeliveryLocations, getCompetitorReachBreakdown, getCompetitorReachByGender, getCompetitorReachByLocation } from "@/lib/competitor-demographics";
import { getCompetitorOverview, type CompetitorCreative } from "@/lib/competitors";
import type { CreativeEmotionScores } from "@/lib/creative-ai";
import { formatCurrency, formatDate, formatNumber } from "@/lib/metrics";

export default async function CompetitorCreativeDetailPage({ params }: { params: Promise<{ clientId: string; creativeId: string }> }) {
  const { clientId, creativeId } = await params;
  const overview = await getCompetitorOverview(clientId);
  const creative = overview.creatives.find((item) => item.id === creativeId);
  if (!creative) notFound();

  const emotionScores = normalizeEmotionScores(creative.analysis?.emotionScores ?? {});
  const euTransparency = getEuTransparencySummary(creative);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href={`/clients/${clientId}/competitors/creatives`} className="text-sm text-primary hover:text-white">Zurueck zu Competitor Creatives</Link>
          <h2 className="mt-2 font-heading text-4xl">Competitor Creative Detail</h2>
          <p className="mt-2 text-sm text-white/60">{creative.competitorName} · {creative.adLibraryId ? `Ad Library ID ${creative.adLibraryId}` : "Public Ad Library Creative"}</p>
        </div>
        <CompetitorSectionNav clientId={clientId} active="creatives" />
      </div>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{creative.competitorName}</Badge>
              <Badge variant="secondary">{creative.format}</Badge>
              <Badge variant={isCompetitorCreativeDisabled(creative.status) ? "destructive" : "success"}>{competitorCreativeStatusLabel(creative.status)}</Badge>
              <Badge variant="outline">Score {creative.rankingScore}/100</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border border-herb-border bg-[radial-gradient(circle_at_top,rgba(229,31,118,0.18),transparent_42%),#1f2937]">
              {creative.videoUrl ? (
                <video controls playsInline poster={creative.thumbnailUrl ?? creative.imageUrl ?? undefined} className="aspect-[4/5] w-full bg-black object-cover">
                  <source src={creative.videoUrl} />
                </video>
              ) : creative.thumbnailUrl || creative.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creative.thumbnailUrl ?? creative.imageUrl ?? ""} alt="" className="aspect-[4/5] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/5] items-end p-5">
                  <p className="font-heading text-3xl text-white/70">{creative.format}</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {creative.sourceUrl ? <Link href={creative.sourceUrl} target="_blank" className="rounded-lg border border-herb-border px-3 py-2 text-sm text-primary hover:border-primary/60 hover:text-white">Ad Library oeffnen</Link> : null}
              {creative.landingUrl ? <Link href={creative.landingUrl} target="_blank" className="rounded-lg border border-herb-border px-3 py-2 text-sm text-primary hover:border-primary/60 hover:text-white">Landingpage</Link> : null}
              <CompetitorAnalyzeButton clientId={clientId} creativeId={creative.id} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <CardTitle>{creative.analysis?.hook ?? creative.hook ?? creative.headline ?? "Ohne Hook"}</CardTitle>
              <CardDescription>{creative.analysis?.hookExplanation ?? creative.primaryText ?? "Noch keine AI Hook-Erklaerung vorhanden."}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Metric label="Reach" value={creative.reachEstimate ? formatNumber(creative.reachEstimate) : "–"} />
              <Metric label="Est. Spend" value={formatCurrency(creative.estimatedSpend ?? 0)} />
              <Metric label="Daily" value={formatCurrency(creative.estimatedDailySpend ?? 0)} />
              <Metric label="Aktive Tage" value={creative.activeDays ? formatNumber(creative.activeDays) : "–"} />
              <Metric label="Start" value={formatDate(creative.startedAt)} />
              <Metric label="Ende" value={formatDate(creative.endedAt)} />
              <Metric label="Gefunden" value={formatDate(creative.createdAt)} />
              <Metric label="Zuletzt gesehen" value={formatDate(creative.lastSeenAt)} />
              <Metric label="CPM Basis" value={creative.estimatedCpm ? formatCurrency(creative.estimatedCpm, 2) : "–"} />
              <Metric label="Confidence" value={creative.estimateConfidence} />
            </CardContent>
          </Card>

          {creative.videoTranscript || creative.videoUrl ? <CompetitorTranscriptCard transcript={creative.videoTranscript} hasVideo={Boolean(creative.videoUrl)} /> : null}

          {creative.analysis && hasEmotionScores(emotionScores) ? <CreativeEmotionRadar scores={emotionScores} /> : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Analyse</CardTitle>
            <CardDescription>Angle, Thesis, Zielgruppe und Adaptionsideen fuer eigene Tests.</CardDescription>
          </CardHeader>
          <CardContent>
            {creative.analysis ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Angle" value={creative.analysis.angle} />
                <Info label="Offer" value={creative.analysis.offer} />
                <Info label="Funnel Stage" value={creative.analysis.funnelStage} />
                <Info label="Zielgruppe" value={creative.analysis.targetAudience} />
                <Info className="md:col-span-2" label="Thesis" value={creative.analysis.thesis} />
                <Info className="md:col-span-2" label="Audience Evidence" value={creative.analysis.audienceReasoning} />
                <Info className="md:col-span-2" label="Strengths" value={creative.analysis.strengths.join(" · ")} />
                <Info className="md:col-span-2" label="Hypothesen" value={creative.analysis.hypotheses.join(" · ")} />
                <Info className="md:col-span-2" label="Adaptation Ideas" value={creative.analysis.adaptationIdeas.join(" · ")} />
              </div>
            ) : (
              <EmptyState title="Noch nicht analysiert" description="Starte die Analyse, um Angle, Thesis, Zielgruppe und Emotion Scores zu bekommen." />
            )}
          </CardContent>
        </Card>

        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Ad Bestandteile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Info label="Primary Text" value={creative.primaryText} />
            <Info label="Headline" value={creative.headline} />
            <Info label="CTA" value={creative.cta} />
            <LinkInfo label="Quelle" href={creative.sourceUrl ?? creative.landingUrl} />
          </CardContent>
        </Card>
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>EU Transparency & Targeting</CardTitle>
          <CardDescription>{euTransparency ? "Aus der EU Ad Transparency Detailansicht extrahiert." : "Keine EU Transparency Details fuer dieses Creative gespeichert."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <LocationMetric locations={euTransparency?.locations ?? creative.audienceLocations} />
            <Metric label="Alter" value={euTransparency?.targetAgeRange ?? creative.analysis?.ageSignal ?? emptyFallback(creative.ageRanges.join(", "))} />
            <Metric label="Gender" value={euTransparency?.targetGender ?? emptyFallback(creative.genderSignals.join(", "))} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Female Reach" value={formatGenderReach(euTransparency?.reachByGender, "Female")} />
            <Metric label="Male Reach" value={formatGenderReach(euTransparency?.reachByGender, "Male")} />
            {genderReachValue(euTransparency?.reachByGender, "Unknown") > 0 ? <Metric label="Unknown Reach" value={formatGenderReach(euTransparency?.reachByGender, "Unknown")} /> : null}
          </div>
          {euTransparency?.reachByLocation.length ? (
            <div className="max-h-56 overflow-auto rounded-xl border border-herb-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-herb-surface text-xs uppercase tracking-[0.14em] text-white/45">
                  <tr>
                    <th className="px-3 py-2">Delivery Location</th>
                    <th className="px-3 py-2 text-right">Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {euTransparency.reachByLocation.map((row) => (
                    <tr key={row.location} className="border-t border-herb-border">
                      <td className="px-3 py-2 text-white">{row.location}</td>
                      <td className="px-3 py-2 text-right text-white">{formatNumber(row.reach)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {euTransparency?.reachBreakdown.length ? (
            <div className="max-h-80 overflow-auto rounded-xl border border-herb-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-herb-surface text-xs uppercase tracking-[0.14em] text-white/45">
                  <tr>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Age</th>
                    <th className="px-3 py-2">Gender</th>
                    <th className="px-3 py-2 text-right">Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {euTransparency.reachBreakdown.map((row, index) => (
                    <tr key={`${row.location}-${row.ageRange}-${row.gender}-${index}`} className="border-t border-herb-border">
                      <td className="px-3 py-2 text-white">{row.location}</td>
                      <td className="px-3 py-2 text-white/65">{row.ageRange}</td>
                      <td className="px-3 py-2 text-white/65">{row.gender}</td>
                      <td className="px-3 py-2 text-right text-white">{formatNumber(row.reach)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 font-medium text-white">{value}</p>
    </div>
  );
}

function LocationMetric({ locations }: { locations: string[] }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">Länder</p>
      {locations.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {locations.map((location) => (
            <Badge key={location} variant="outline" className="border-white/15 text-white">
              {location}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-1 font-medium text-white">–</p>
      )}
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className ? `rounded-xl border border-herb-border bg-black/20 p-3 ${className}` : "rounded-xl border border-herb-border bg-black/20 p-3"}>
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-white/70">{value || "–"}</p>
    </div>
  );
}

function LinkInfo({ label, href }: { label: string; href: string | null | undefined }) {
  const display = displayLink(href);
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      {href ? (
        <Link href={href} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm leading-6 text-primary hover:text-white">
          {display}
        </Link>
      ) : (
        <p className="mt-1 text-sm leading-6 text-white/70">–</p>
      )}
    </div>
  );
}

function CompetitorTranscriptCard({ transcript, hasVideo }: { transcript: CompetitorCreative["videoTranscript"]; hasVideo: boolean }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>Video Transcript</CardTitle>
        <CardDescription>
          {transcript?.status === "completed"
            ? `Transkribiert mit ${transcript.provider} ${transcript.model}${transcript.durationSeconds ? ` · ${formatSeconds(transcript.durationSeconds)}` : ""}${transcript.language ? ` · ${transcript.language}` : ""}`
            : hasVideo
              ? "Wird bei der naechsten Analyse oder Bulk Analyse automatisch transkribiert."
              : "Keine Video-Quelle fuer dieses Creative gespeichert."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {transcript?.status === "failed" ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{transcript.errorMessage ?? "Transkription fehlgeschlagen."}</p> : null}
        {transcript?.status === "processing" ? <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-white">Transkription laeuft.</p> : null}
        {transcript?.status === "completed" && transcript.transcript ? (
          <>
            <Info label="Hook Transcript" value={transcript.segments.length ? transcript.segments.slice(0, 3).map((segment) => segment.text).join(" ") : transcript.transcript.split(/\s+/).slice(0, 45).join(" ")} />
            <div className="rounded-xl border border-herb-border bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-white/40">Full Script</p>
              <div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-sm leading-6 text-white/70">
                {transcript.transcript}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function displayLink(value: string | null | undefined) {
  if (!value) return "–";
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") + url.pathname + url.search;
  } catch {
    return value;
  }
}

function emptyFallback(value: string) {
  return value.trim() || "–";
}

function genderReachValue(rows: Array<{ gender: string; reach: number }> | null | undefined, gender: string) {
  return rows?.find((row) => row.gender === gender)?.reach ?? 0;
}

function formatGenderReach(rows: Array<{ gender: string; reach: number }> | null | undefined, gender: string) {
  const reach = genderReachValue(rows, gender);
  return reach > 0 ? formatNumber(reach) : "–";
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function normalizeEmotionScores(value: Record<string, unknown>): CreativeEmotionScores {
  function score(key: string) {
    const parsed = Number(value[key]);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
  }

  return {
    curiosity: score("curiosity"),
    desire: score("desire"),
    trust: score("trust"),
    urgency: score("urgency"),
    joy: score("joy"),
    fearOfMissingOut: score("fearOfMissingOut")
  };
}

function getEuTransparencySummary(creative: CompetitorCreative) {
  const signals = creative.demographicSignals;
  if (signals.source !== "meta_eu_transparency") return null;

  const locations = getCompetitorDeliveryLocations(signals, creative.audienceLocations);
  const reachBreakdown = getCompetitorReachBreakdown(signals);
  const reachByLocation = getCompetitorReachByLocation(signals);
  const reachByGender = getCompetitorReachByGender(signals);

  return {
    locations,
    targetAgeRange: typeof signals.targetAgeRange === "string" ? signals.targetAgeRange : null,
    targetGender: typeof signals.targetGender === "string" ? signals.targetGender : null,
    euReach: typeof signals.euReach === "number" ? signals.euReach : null,
    reachByLocation,
    reachByGender,
    reachBreakdown
  };
}
