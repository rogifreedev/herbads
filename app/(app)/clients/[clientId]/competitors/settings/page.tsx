import Link from "next/link";
import {
  CompetitorCreateForm,
  CompetitorCrawlToggle,
  CompetitorCreativeForm,
  CompetitorSourceCrawlButton,
  CompetitorSourceForm
} from "@/components/competitor-intelligence-actions";
import { CompetitorSectionNav } from "@/components/competitor-section-nav";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompetitorOverview, type Competitor, type CompetitorSource } from "@/lib/competitors";
import { formatCurrency, formatDate, formatNumber } from "@/lib/metrics";

export default async function CompetitorSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const overview = await getCompetitorOverview(clientId);
  const competitorsById = new Map(overview.competitors.map((competitor) => [competitor.id, competitor]));
  const connectedCompetitors = overview.competitors.filter((competitor) => competitor.crawlEnabled);
  const completedSources = overview.sources.filter((source) => source.status === "completed").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Competitor Settings</h2>
          <p className="mt-2 text-sm text-white/60">Lege Competitors an, verbinde nur relevante Accounts fuer Crawls und verwalte Meta Ad Library Sources.</p>
        </div>
        <CompetitorSectionNav clientId={clientId} active="settings" />
      </div>

      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Competitors" value={formatNumber(overview.totals.competitors)} />
        <SummaryCard label="Verbunden" value={formatNumber(connectedCompetitors.length)} />
        <SummaryCard label="Sources" value={formatNumber(overview.sources.length)} />
        <SummaryCard label="Crawls fertig" value={formatNumber(completedSources)} />
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Competitor anlegen</CardTitle>
          <CardDescription>Name, Website und Meta Ad Library Link reichen fuer den Start. Eigener CPM fuer Schaetzungen: {formatCurrency(overview.ownCpm, 2)} ({overview.ownCpmConfidence})</CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitorCreateForm clientId={clientId} />
        </CardContent>
      </Card>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Competitors verbinden</CardTitle>
          <CardDescription>Nur verbundene Competitors duerfen gecrawlt werden. So kannst du Quellen parken, ohne dass sie beim Crawl laufen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.competitors.length === 0 ? <EmptyState title="Keine Competitors" description="Lege zuerst einen Competitor mit Meta Ad Library Link an." /> : null}
          {overview.competitors.map((competitor) => (
            <div key={competitor.id} className="rounded-xl border border-herb-border bg-black/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-2xl text-white">{competitor.name}</p>
                    <Badge variant={competitor.crawlEnabled ? "success" : "secondary"}>{competitor.crawlEnabled ? "Crawl verbunden" : "Nicht crawlen"}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
                    <span>Erstellt {formatDate(competitor.createdAt)}</span>
                    {competitor.websiteUrl ? <Link href={competitor.websiteUrl} target="_blank" className="text-primary hover:text-white">{displayUrl(competitor.websiteUrl)}</Link> : null}
                    {competitor.metaAdLibraryUrl ? <Link href={competitor.metaAdLibraryUrl} target="_blank" className="text-primary hover:text-white">Ad Library</Link> : null}
                  </div>
                  {competitor.notes ? <p className="mt-3 text-sm text-white/60">{competitor.notes}</p> : null}
                </div>
                <CompetitorCrawlToggle clientId={clientId} competitorId={competitor.id} enabled={competitor.crawlEnabled} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Ad Library Sources</CardTitle>
          <CardDescription>Speichere direkte Meta Ad Library Links und starte Crawls nur fuer verbundene Competitors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CompetitorSourceForm clientId={clientId} competitors={overview.competitors} />
          <div className="space-y-3">
            {overview.sources.length === 0 ? <EmptyState title="Keine Sources" description="Speichere einen Ad Library Link, um Competitor Ads zu crawlen." /> : null}
            {overview.sources.map((source) => {
              const competitor = source.competitorId ? competitorsById.get(source.competitorId) ?? null : null;
              return <SourceRow key={source.id} clientId={clientId} source={source} competitor={competitor} />;
            })}
          </div>
        </CardContent>
      </Card>

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

      <details className="rounded-2xl border border-herb-border bg-herb-surface/90 p-4">
        <summary className="cursor-pointer select-none font-medium text-white">Advanced: Competitor Creative manuell ergaenzen</summary>
        <div className="mt-4">
          <CompetitorCreativeForm clientId={clientId} competitors={overview.competitors} />
        </div>
      </details>
    </div>
  );
}

function SourceRow({ clientId, source, competitor }: { clientId: string; source: CompetitorSource; competitor: Competitor | null }) {
  const canCrawl = !competitor || competitor.crawlEnabled;

  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-3 text-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sourceStatusVariant(source.status)}>{source.status}</Badge>
            {competitor ? <Badge variant={competitor.crawlEnabled ? "success" : "secondary"}>{competitor.name}</Badge> : <Badge variant="outline">Ohne Zuordnung</Badge>}
            <span className="text-xs text-white/45">Gespeichert {formatDate(source.createdAt)}</span>
          </div>
          <Link href={source.url} target="_blank" className="block truncate text-primary hover:text-white">{source.url}</Link>
          <p className="text-xs text-white/45">Zuletzt geprueft: {formatDate(source.lastCheckedAt)}</p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          {canCrawl ? (
            <CompetitorSourceCrawlButton clientId={clientId} sourceId={source.id} status={source.status} />
          ) : (
            <Badge variant="secondary">Crawl in Settings getrennt</Badge>
          )}
        </div>
      </div>
      {source.errorMessage ? <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-200">{source.errorMessage}</p> : null}
    </div>
  );
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

function sourceStatusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (status === "completed") return "success";
  if (status === "failed") return "destructive";
  if (status === "running") return "warning";
  return "secondary";
}

function displayUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
