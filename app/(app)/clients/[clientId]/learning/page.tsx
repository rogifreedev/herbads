import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdIdeasGenerateForm } from "@/components/ad-ideas-generate-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { getCreativeLearningOverview, type HookOpportunity, type IdeaPrediction, type LearningPattern } from "@/lib/creative-learning";
import type { Translator } from "@/lib/i18n-types";
import { formatNumber } from "@/lib/metrics";

export default async function CreativeLearningPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("learning");
  const overview = await getCreativeLearningOverview(clientId);

  return (
    <div className="space-y-6">
      <div className="max-w-4xl">
        <p className="text-xs uppercase tracking-[0.22em] text-primary">Self Learning System</p>
        <h2 className="mt-2 font-heading text-4xl">Creative Learning</h2>
        <p className="mt-2 text-sm text-white/60">
          {t("subtitle")}
        </p>
      </div>

      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Creatives" value={formatNumber(overview.totals.creatives)} />
        <SummaryCard label={t("aiAnalyzed")} value={formatNumber(overview.totals.analyzedCreatives)} />
        <SummaryCard label="Angles" value={formatNumber(overview.totals.angles)} />
        <SummaryCard label="Ad Ideas" value={formatNumber(overview.totals.ideas)} />
        <SummaryCard label="Avg Score" value={formatNumber(overview.totals.avgCreativeScore)} />
        <SummaryCard label="Confidence" value={`${formatNumber(overview.totals.learningConfidence)}%`} />
      </section>

      <Card className="border-primary/30 bg-gradient-to-br from-primary/15 via-herb-surface to-herb-surface">
        <CardHeader>
          <CardTitle>{t("generateTitle")}</CardTitle>
          <CardDescription>
            {t("generateDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdIdeasGenerateForm clientId={clientId} defaultCount="8" defaultFocus={learningFocus(overview, t)} buttonLabel={t("generateButton")} hideFocus />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <PatternSection
          title="Winner Patterns"
          description={t("winnerDescription")}
          emptyTitle={t("winnerEmptyTitle")}
          emptyDescription={t("winnerEmptyDescription")}
          patterns={overview.winnerPatterns}
          clientId={clientId}
        />
        <PatternSection
          title="Loser Patterns"
          description={t("loserDescription")}
          emptyTitle={t("loserEmptyTitle")}
          emptyDescription={t("loserEmptyDescription")}
          patterns={overview.loserPatterns}
          clientId={clientId}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PatternSection
          title="Emerging Opportunities"
          description={t("opportunitiesDescription")}
          emptyTitle={t("opportunitiesEmptyTitle")}
          emptyDescription={t("opportunitiesEmptyDescription")}
          patterns={overview.opportunities}
          clientId={clientId}
        />
        <PatternSection
          title="Fatigue Warnings"
          description={t("fatigueDescription")}
          emptyTitle={t("fatigueEmptyTitle")}
          emptyDescription={t("fatigueEmptyDescription")}
          patterns={overview.fatigueWarnings}
          clientId={clientId}
        />
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>{t("hookTestsTitle")}</CardTitle>
          <CardDescription>{t("hookTestsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.hookOpportunities.length === 0 ? (
            <EmptyState title={t("noHookOpportunitiesTitle")} description={t("noHookOpportunitiesDescription")} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {overview.hookOpportunities.map((item) => <HookOpportunityCard key={item.id} item={item} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Prediction Board</CardTitle>
          <CardDescription>{t("predictionBoardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.predictions.length === 0 ? (
            <EmptyState title={t("noPredictionsTitle")} description={t("noPredictionsDescription")} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {overview.predictions.map((prediction) => <PredictionCard key={prediction.idea.id} prediction={prediction} />)}
            </div>
          )}
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

function learningFocus(overview: Awaited<ReturnType<typeof getCreativeLearningOverview>>, t: Translator) {
  const winners = overview.winnerPatterns.map((pattern) => pattern.title).slice(0, 4).join(", ") || t("focusFallbackWinners");
  const losers = overview.loserPatterns.map((pattern) => pattern.title).slice(0, 3).join(", ") || t("focusFallbackLosers");
  const opportunities = overview.opportunities.map((pattern) => pattern.title).slice(0, 3).join(", ") || t("focusFallbackOpportunities");
  const fatigue = overview.fatigueWarnings.map((pattern) => pattern.title).slice(0, 3).join(", ") || t("focusFallbackFatigue");

  return t("generateFocus", { winners, losers, opportunities, fatigue });
}

function PatternSection({ title, description, emptyTitle, emptyDescription, patterns, clientId }: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  patterns: LearningPattern[];
  clientId: string;
}) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {patterns.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} /> : patterns.map((pattern) => <PatternCard key={pattern.id} pattern={pattern} clientId={clientId} />)}
      </CardContent>
    </Card>
  );
}

function PatternCard({ pattern, clientId }: { pattern: LearningPattern; clientId: string }) {
  return (
    <article className="rounded-2xl border border-herb-border bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={pattern.signal === "winner" ? "default" : pattern.signal === "loser" ? "destructive" : "secondary"}>{pattern.signal}</Badge>
            <Badge variant="outline">Confidence {pattern.confidence}%</Badge>
          </div>
          <h3 className="mt-3 font-heading text-2xl text-white">{pattern.title}</h3>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-heading text-3xl text-primary">{pattern.score}</p>
          <p className="text-xs text-white/40">Score</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-white/70">{pattern.insight}</p>
      <p className="mt-3 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-white/75">{pattern.recommendation}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {pattern.evidence.map((item) => <span key={item} className="rounded-full bg-white/5 px-2 py-1 text-xs text-white/50">{item}</span>)}
      </div>
      {pattern.exampleCreatives.length > 0 ? (
        <div className="mt-3 space-y-1">
          {pattern.exampleCreatives.map((creative) => (
            <Link key={creative.id} href={`/clients/${clientId}/creatives/${creative.id}`} className="block truncate text-xs text-primary hover:text-white">
              {creative.name} · Score {creative.score}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function HookOpportunityCard({ item }: { item: HookOpportunity }) {
  const t = useTranslations("learning");

  return (
    <article className="rounded-2xl border border-herb-border bg-black/20 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge>{item.format}</Badge>
        <Badge variant="secondary">{item.angle}</Badge>
        <Badge variant="outline">Prediction {item.predictedScore}</Badge>
        <Badge variant="outline">Confidence {item.confidence}%</Badge>
      </div>
      <h3 className="mt-3 font-heading text-2xl text-white">{item.hook}</h3>
      <p className="mt-3 text-sm text-white/70">{item.why}</p>
      <p className="mt-3 text-xs text-white/40">{t("sourceLabel", { source: item.sourcePattern })}</p>
    </article>
  );
}

function PredictionCard({ prediction }: { prediction: IdeaPrediction }) {
  const t = useTranslations("learning");

  return (
    <article className="rounded-2xl border border-herb-border bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge>{prediction.idea.format}</Badge>
            {prediction.idea.funnelStage ? <Badge variant="secondary">{prediction.idea.funnelStage}</Badge> : null}
            {prediction.idea.angle ? <Badge variant="outline">{prediction.idea.angle}</Badge> : null}
          </div>
          <h3 className="font-heading text-2xl text-white">{prediction.idea.hook}</h3>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-heading text-3xl text-primary">{prediction.predictedScore}</p>
          <p className="text-xs text-white/40">Predicted</p>
        </div>
      </div>
      {prediction.idea.concept ? <p className="mt-3 text-sm text-white/70">{prediction.idea.concept}</p> : null}
      <div className="mt-4 grid gap-2 text-xs text-white/55 sm:grid-cols-3">
        <span>Confidence {prediction.confidence}%</span>
        <span>CTR Band {prediction.predictedCtr}</span>
        <span>CPA Band {prediction.predictedCpa}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoList title={t("whyTitle")} items={prediction.rationale} />
        <InfoList title={t("risksTitle")} items={prediction.risks} />
      </div>
    </article>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{title}</p>
      <div className="mt-2 space-y-1">
        {items.map((item) => <p key={item} className="text-sm text-white/65">{item}</p>)}
      </div>
    </div>
  );
}
