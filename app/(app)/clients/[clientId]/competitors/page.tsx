import Link from "next/link";
import { CompetitorAnalyzeButton, CompetitorCreateForm, CompetitorCreativeForm, CompetitorSourceCrawlButton, CompetitorSourceForm } from "@/components/competitor-intelligence-actions";
import { CreativeEmotionRadar, hasEmotionScores } from "@/components/creative-emotion-radar";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompetitorOverview, type CompetitorCreative } from "@/lib/competitors";
import type { CreativeEmotionScores } from "@/lib/creative-ai";
import { formatCurrency, formatDate, formatNumber } from "@/lib/metrics";

export default async function CompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const overview = await getCompetitorOverview(clientId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-4xl">Competitors</h2>
        <p className="mt-2 text-sm text-white/60">Competitor Ad Library Quellen, manuelle Creative-Erfassung, Reach-/Budget-Schaetzung und AI Analyse fuer neue Ad Ideas.</p>
      </div>

      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Competitors" value={formatNumber(overview.totals.competitors)} />
        <SummaryCard label="Creatives" value={formatNumber(overview.totals.creatives)} />
        <SummaryCard label="Analysiert" value={formatNumber(overview.totals.analyzedCreatives)} />
        <SummaryCard label="Est. Spend" value={formatCurrency(overview.totals.estimatedSpend)} />
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Competitor hinzufügen</CardTitle>
          <CardDescription>Name, Website und Meta Ad Library Link reichen fuer den Start. Eigener CPM fuer Schaetzungen: {formatCurrency(overview.ownCpm, 2)} ({overview.ownCpmConfidence})</CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitorCreateForm clientId={clientId} />
        </CardContent>
      </Card>

      <details className="rounded-2xl border border-herb-border bg-herb-surface/90 p-4">
        <summary className="cursor-pointer select-none font-medium text-white">Advanced: Source oder Creative manuell ergänzen</summary>
        <div className="mt-4 space-y-6">
          <div>
            <p className="mb-3 text-sm font-medium text-white">Zusätzlichen Ad Library Link speichern</p>
            <CompetitorSourceForm clientId={clientId} competitors={overview.competitors} />
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-white">Competitor Creative manuell erfassen</p>
            <CompetitorCreativeForm clientId={clientId} competitors={overview.competitors} />
          </div>
        </div>
      </details>

      {overview.detectedLinks.length > 0 ? (
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Gefundene Ad Library Links</CardTitle>
            <CardDescription>Aus Kundenprofil und Wissensdatenbank erkannt. Speichere relevante Links als Source.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.detectedLinks.map((link) => (
              <div key={`${link.source}-${link.url}`} className="flex flex-col gap-2 rounded-xl border border-herb-border bg-black/20 p-3 text-sm md:flex-row md:items-center md:justify-between">
                <Link href={link.url} target="_blank" className="truncate text-primary hover:text-white">{link.url}</Link>
                <Badge variant="secondary">{link.source}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Competitor Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.sources.length === 0 ? <EmptyState title="Keine Sources" description="Speichere Ad Library Links, um Competitor Ads zu dokumentieren." /> : overview.sources.map((source) => (
              <div key={source.id} className="rounded-xl border border-herb-border bg-black/20 p-3 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={sourceStatusVariant(source.status)}>{source.status}</Badge>
                      <span className="text-xs text-white/45">Gespeichert {formatDate(source.createdAt)}</span>
                    </div>
                    <Link href={source.url} target="_blank" className="block truncate text-primary hover:text-white">{source.url}</Link>
                    <p className="text-xs text-white/45">Zuletzt geprüft: {formatDate(source.lastCheckedAt)}</p>
                  </div>
                  <CompetitorSourceCrawlButton clientId={clientId} sourceId={source.id} status={source.status} />
                </div>
                {source.errorMessage ? <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-200">{source.errorMessage}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Competitor Creative Ranking</CardTitle>
            <CardDescription>Ranking kombiniert Reach Velocity, geschaetzten Spend und AI-Relevanz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overview.creatives.length === 0 ? <EmptyState title="Keine Competitor Creatives" description="Erfasse ein sichtbares Competitor Creative aus der Ad Library oder einem Screenshot/Video-Link." /> : overview.creatives.map((creative) => <CompetitorCreativeCard key={creative.id} clientId={clientId} creative={creative} />)}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function sourceStatusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (status === "completed") return "success";
  if (status === "failed") return "destructive";
  if (status === "running") return "warning";
  return "secondary";
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
        <p className="mt-2 font-heading text-3xl text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

function CompetitorCreativeCard({ clientId, creative }: { clientId: string; creative: CompetitorCreative }) {
  const emotionScores = normalizeEmotionScores(creative.analysis?.emotionScores ?? {});

  return (
    <article className="rounded-2xl border border-herb-border bg-black/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge>{creative.competitorName}</Badge>
            <Badge variant="secondary">{creative.format}</Badge>
            <Badge variant="outline">Confidence {creative.estimateConfidence}</Badge>
          </div>
          <h3 className="mt-3 font-heading text-2xl text-white">{creative.analysis?.hook ?? creative.hook ?? creative.headline ?? "Ohne Hook"}</h3>
          {creative.analysis?.hookExplanation ? <p className="mt-2 text-sm text-white/55">{creative.analysis.hookExplanation}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-heading text-4xl text-primary">{creative.rankingScore}</p>
            <p className="text-xs text-white/40">Ranking</p>
          </div>
          <CompetitorAnalyzeButton clientId={clientId} creativeId={creative.id} />
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-white/60 md:grid-cols-4">
        <span>Reach {creative.reachEstimate ? formatNumber(creative.reachEstimate) : "–"}</span>
        <span>Est. Spend {formatCurrency(creative.estimatedSpend ?? 0)}</span>
        <span>Daily {formatCurrency(creative.estimatedDailySpend ?? 0)}</span>
        <span>{creative.activeDays ? `${creative.activeDays} Tage aktiv` : "Laufzeit offen"}</span>
      </div>
      {creative.primaryText ? <p className="mt-4 text-sm text-white/70">{creative.primaryText}</p> : null}
      {creative.analysis ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-3 text-sm text-white/70">
            {creative.analysis.angle ? <Info label="Angle" value={creative.analysis.angle} /> : null}
            {creative.analysis.offer ? <Info label="Offer" value={creative.analysis.offer} /> : null}
            {creative.analysis.adaptationIdeas.length > 0 ? <Info label="Adaptation Ideas" value={creative.analysis.adaptationIdeas.join(" · ")} /> : null}
            {creative.analysis.strengths.length > 0 ? <Info label="Staerken" value={creative.analysis.strengths.join(" · ")} /> : null}
          </div>
          {hasEmotionScores(emotionScores) ? <CreativeEmotionRadar scores={emotionScores} /> : null}
        </div>
      ) : null}
      {creative.sourceUrl ? <Link href={creative.sourceUrl} target="_blank" className="mt-4 block truncate text-xs text-primary hover:text-white">{creative.sourceUrl}</Link> : null}
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-herb-border bg-black/20 p-3"><p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-1">{value}</p></div>;
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
