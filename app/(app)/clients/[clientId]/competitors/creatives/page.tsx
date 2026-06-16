import Link from "next/link";
import { CompetitorBulkAnalyzeButton } from "@/components/competitor-intelligence-actions";
import { CompetitorCreativesTable } from "@/components/competitor-creatives-table";
import { CompetitorSectionNav } from "@/components/competitor-section-nav";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompetitorOverview, type Competitor, type CompetitorCreative } from "@/lib/competitors";
import type { CreativeEmotionScores } from "@/lib/creative-ai";
import { formatCurrency, formatDate, formatNumber } from "@/lib/metrics";

type CompetitorCreativeGroup = {
  competitorId: string | null;
  competitorName: string;
  crawlEnabled: boolean;
  creatives: CompetitorCreative[];
};

export default async function CompetitorCreativesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const overview = await getCompetitorOverview(clientId);
  const groups = groupCreativesByCompetitor(overview.competitors, overview.creatives);
  const angleClusters = buildAngleClusters(overview.creatives);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Competitor Creatives</h2>
          <p className="mt-2 text-sm text-white/60">Pro Competitor alle gecrawlten Meta Ads mit EU Transparency, Reach-Indizien, Angle und AI Analyse.</p>
        </div>
        <CompetitorSectionNav clientId={clientId} active="creatives" />
      </div>

      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Competitors" value={formatNumber(overview.totals.competitors)} />
        <SummaryCard label="Creatives" value={formatNumber(overview.totals.creatives)} />
        <SummaryCard label="Analysiert" value={formatNumber(overview.totals.analyzedCreatives)} />
        <SummaryCard label="Est. Spend" value={formatCurrency(overview.totals.estimatedSpend)} />
      </section>

      {angleClusters.length > 0 ? (
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Competitor Angle Cluster</CardTitle>
            <CardDescription>Aufteilung der analysierten Ads nach Angle, Spend-Indiz und dominanter Emotion.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {angleClusters.map((cluster) => (
              <div key={cluster.angle} className="rounded-xl border border-herb-border bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-2xl text-white">{cluster.angle}</p>
                    <p className="mt-1 text-xs text-white/45">{formatNumber(cluster.count)} Ads · {formatCurrency(cluster.estimatedSpend)} Est. Spend</p>
                  </div>
                  <Badge variant="secondary">{cluster.topEmotion}</Badge>
                </div>
                {cluster.thesis ? <p className="mt-3 text-sm leading-6 text-white/65">{cluster.thesis}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <Card className="border-herb-border bg-herb-surface/90">
          <CardContent className="p-6">
            <EmptyState title="Keine Competitor Creatives" description="Verbinde im Settings-Bereich einen Competitor und starte den Ad Library Crawl." />
          </CardContent>
        </Card>
      ) : null}

      {groups.map((group) => (
        <Card key={group.competitorId ?? "unassigned"} className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{group.competitorName}</CardTitle>
                  <Badge variant={group.crawlEnabled ? "success" : "secondary"}>{group.crawlEnabled ? "Crawl verbunden" : "Nicht verbunden"}</Badge>
                </div>
                <CardDescription className="mt-2">
                  {formatNumber(group.creatives.length)} Ads · {formatCurrency(sumSpend(group.creatives))} Est. Spend · {formatNumber(group.creatives.filter((creative) => creative.analysis).length)} analysiert
                </CardDescription>
              </div>
              <CompetitorBulkAnalyzeButton clientId={clientId} creativeIds={group.creatives.map((creative) => creative.id)} />
            </div>
          </CardHeader>
          <CardContent>
            <CompetitorCreativesTable clientId={clientId} creatives={group.creatives} />
          </CardContent>
        </Card>
      ))}

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Creative Grid</CardTitle>
          <CardDescription>Schneller visueller Scan der besten gecrawlten Competitor Ads.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 2xl:grid-cols-4">
          {overview.creatives.length === 0 ? (
            <EmptyState className="col-span-full" title="Noch keine Competitor Ads gecrawlt" description="Starte in den Competitor Settings den Crawl einer verbundenen Ad Library Source." />
          ) : null}
          {overview.creatives.slice(0, 72).map((creative) => (
            <GridCreativeCard key={creative.id} clientId={clientId} creative={creative} />
          ))}
        </CardContent>
      </Card>
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

function GridCreativeCard({ clientId, creative }: { clientId: string; creative: CompetitorCreative }) {
  return (
    <Link href={`/clients/${clientId}/competitors/creatives/${creative.id}`} className="group rounded-2xl border border-herb-border bg-black/30 p-4 transition hover:border-primary/60">
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,rgba(229,31,118,0.18),transparent_42%),#1f2937]">
        {creative.thumbnailUrl || creative.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creative.thumbnailUrl ?? creative.imageUrl ?? ""} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : creative.videoUrl ? (
          <video muted playsInline preload="metadata" className="h-full w-full object-cover">
            <source src={creative.videoUrl} />
          </video>
        ) : (
          <div className="flex h-full items-end p-4">
            <p className="font-heading text-2xl text-white/70">{creative.format}</p>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{creative.competitorName}</Badge>
          <Badge variant="secondary">{creative.format}</Badge>
          <Badge variant={creative.status === "active" ? "success" : "outline"}>{creative.status}</Badge>
        </div>
        <p className="line-clamp-2 font-medium text-white">{creative.analysis?.hook ?? creative.hook ?? creative.headline ?? "Ohne Hook"}</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
          <span>Reach {creative.reachEstimate ? formatNumber(creative.reachEstimate) : "–"}</span>
          <span>Spend {formatCurrency(creative.estimatedSpend ?? 0)}</span>
          <span>Start {formatDate(creative.startedAt)}</span>
          <span>Score {creative.rankingScore}/100</span>
        </div>
      </div>
    </Link>
  );
}

function groupCreativesByCompetitor(competitors: Competitor[], creatives: CompetitorCreative[]): CompetitorCreativeGroup[] {
  const competitorsById = new Map(competitors.map((competitor) => [competitor.id, competitor]));
  const groups = new Map<string, CompetitorCreativeGroup>();

  for (const creative of creatives) {
    const key = creative.competitorId ?? "unassigned";
    const competitor = creative.competitorId ? competitorsById.get(creative.competitorId) : null;
    const group = groups.get(key) ?? {
      competitorId: creative.competitorId,
      competitorName: competitor?.name ?? creative.competitorName,
      crawlEnabled: competitor?.crawlEnabled ?? true,
      creatives: []
    };
    group.creatives.push(creative);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((a, b) => sumSpend(b.creatives) - sumSpend(a.creatives) || b.creatives.length - a.creatives.length);
}

function sumSpend(creatives: CompetitorCreative[]) {
  return creatives.reduce((sum, creative) => sum + (creative.estimatedSpend ?? 0), 0);
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

function buildAngleClusters(creatives: CompetitorCreative[]) {
  const clusters = new Map<string, {
    angle: string;
    count: number;
    estimatedSpend: number;
    thesis: string | null;
    emotionTotals: Record<keyof CreativeEmotionScores, number>;
    emotionCounts: Record<keyof CreativeEmotionScores, number>;
  }>();
  const emotionKeys: Array<keyof CreativeEmotionScores> = ["curiosity", "desire", "trust", "urgency", "joy", "fearOfMissingOut"];

  for (const creative of creatives) {
    const angle = creative.analysis?.angle?.trim() || "Unclassified";
    const cluster = clusters.get(angle) ?? {
      angle,
      count: 0,
      estimatedSpend: 0,
      thesis: null,
      emotionTotals: { curiosity: 0, desire: 0, trust: 0, urgency: 0, joy: 0, fearOfMissingOut: 0 },
      emotionCounts: { curiosity: 0, desire: 0, trust: 0, urgency: 0, joy: 0, fearOfMissingOut: 0 }
    };
    const scores = normalizeEmotionScores(creative.analysis?.emotionScores ?? {});
    cluster.count += 1;
    cluster.estimatedSpend += creative.estimatedSpend ?? 0;
    cluster.thesis ??= creative.analysis?.thesis ?? creative.analysis?.hypotheses?.[0] ?? null;

    for (const key of emotionKeys) {
      const value = scores[key];
      if (value === null) continue;
      cluster.emotionTotals[key] += value;
      cluster.emotionCounts[key] += 1;
    }

    clusters.set(angle, cluster);
  }

  return Array.from(clusters.values())
    .map((cluster) => {
      const topEmotion = emotionKeys
        .map((key) => ({
          key,
          value: cluster.emotionCounts[key] > 0 ? cluster.emotionTotals[key] / cluster.emotionCounts[key] : 0
        }))
        .sort((a, b) => b.value - a.value)[0]?.key ?? "curiosity";

      return {
        angle: cluster.angle,
        count: cluster.count,
        estimatedSpend: cluster.estimatedSpend,
        thesis: cluster.thesis,
        topEmotion: topEmotion === "fearOfMissingOut" ? "FOMO" : topEmotion
      };
    })
    .filter((cluster) => cluster.angle !== "Unclassified")
    .sort((a, b) => b.estimatedSpend - a.estimatedSpend || b.count - a.count)
    .slice(0, 9);
}
