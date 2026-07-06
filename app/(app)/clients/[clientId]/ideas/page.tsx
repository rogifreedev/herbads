import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdIdeaStatusSelect } from "@/components/ad-idea-status-select";
import { AdIdeasGenerateForm } from "@/components/ad-ideas-generate-form";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getAdIdeasOverview, type HookInsight } from "@/lib/ad-ideas";
import { formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/metrics";

export default async function AdIdeasPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("ideas");
  const tCommon = await getTranslations("common");
  const overview = await getAdIdeasOverview(clientId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-4xl">Ad Ideas</h2>
        <p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
      </div>

      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label={t("savedIdeas")} value={formatNumber(overview.totals.ideas)} />
        <SummaryCard label="Hook Patterns" value={formatNumber(overview.totals.hooks)} />
        <SummaryCard label={tCommon("aiAnalyzed")} value={formatNumber(overview.totals.analyzedCreatives)} />
        <SummaryCard label={t("activeMetaAds")} value={formatNumber(overview.totals.activeAds)} />
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>{t("generateTitle")}</CardTitle>
          <CardDescription>{t("generateDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdIdeasGenerateForm clientId={clientId} />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>{t("bestHooks")}</CardTitle>
            <CardDescription>{t("bestHooksDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.hookInsights.length === 0 ? (
              <EmptyState title={t("noHookInsightsTitle")} description={t("noHookInsightsDescription")} />
            ) : overview.hookInsights.slice(0, 8).map((insight) => <HookInsightCard key={insight.hook} clientId={clientId} insight={insight} />)}
          </CardContent>
        </Card>

        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>{t("metaContext")}</CardTitle>
            <CardDescription>{t("metaContextDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-white/65">
            <ContextBlock title="Campaign Objectives" items={contextItems(overview.metaContextSummary.campaignObjectives)} />
            <ContextBlock title="Optimization Goals" items={contextItems(overview.metaContextSummary.optimizationGoals)} />
            <ContextBlock title="Ad Name Patterns" items={contextStrings(overview.metaContextSummary.adNamePatterns)} />
          </CardContent>
        </Card>
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Idea Board</CardTitle>
          <CardDescription>{t("ideaBoardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.ideas.length === 0 ? (
            <EmptyState title={t("noIdeasTitle")} description={t("noIdeasDescription")} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {overview.ideas.map((idea) => (
                <article key={idea.id} className="rounded-2xl border border-herb-border bg-black/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{idea.format}</Badge>
                        {idea.funnelStage ? <Badge variant="secondary">{idea.funnelStage}</Badge> : null}
                        {idea.score !== null ? <Badge variant="outline">Score {idea.score}</Badge> : null}
                      </div>
                      <h3 className="font-heading text-2xl text-white">{idea.hook}</h3>
                    </div>
                    <AdIdeaStatusSelect clientId={clientId} ideaId={idea.id} status={idea.status} />
                  </div>
                  {idea.angle ? <p className="mt-3 text-sm text-primary">Angle: {idea.angle}</p> : null}
                  {idea.concept ? <p className="mt-3 text-sm text-white/75">{idea.concept}</p> : null}
                  <div className="mt-4 grid gap-3 text-sm text-white/65 md:grid-cols-2">
                    {idea.visualDirection ? <Info label="Visual" value={idea.visualDirection} /> : null}
                    {idea.firstSeconds ? <Info label="First Seconds" value={idea.firstSeconds} /> : null}
                    {idea.headline ? <Info label="Headline" value={idea.headline} /> : null}
                    {idea.cta ? <Info label="CTA" value={idea.cta} /> : null}
                  </div>
                  {idea.scriptOutline ? <Info className="mt-4" label="Script" value={idea.scriptOutline} /> : null}
                  {idea.primaryText ? <Info className="mt-4" label="Primary Text" value={idea.primaryText} /> : null}
                  {idea.rationale ? <p className="mt-4 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-white/70">{idea.rationale}</p> : null}
                  {idea.sourcePatterns.length > 0 ? <p className="mt-3 text-xs text-white/40">Patterns: {idea.sourcePatterns.join(", ")}</p> : null}
                </article>
              ))}
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

function HookInsightCard({ clientId, insight }: { clientId: string; insight: HookInsight }) {
  const t = useTranslations("ideas");
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-white">{insight.hook}</p>
          <p className="mt-1 text-xs text-white/45">{insight.formats.join(", ") || t("formatOpen")} · {insight.funnelStages.join(", ") || t("funnelOpen")}</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-2xl text-primary">{insight.avgScore}</p>
          <p className="text-xs text-white/40">Score</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/60 md:grid-cols-4">
        <span>{formatCurrency(insight.spend)}</span>
        <span>CTR {formatPercent(insight.ctr)}</span>
        <span>Hook {formatPercent(insight.hookRate)}</span>
        <span>ROAS {formatDecimal(insight.roas)}</span>
        <span>Conv. {formatNumber(insight.purchases)}</span>
        <span>CVR {formatPercent(insight.outboundCvr)}</span>
        <span>{formatNumber(insight.impressions)} Impr.</span>
        <span>{formatNumber(insight.creativeCount)} Creatives</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/45">
        {insight.campaignObjectives.map((item) => <span key={item} className="rounded-full bg-white/5 px-2 py-1">{item}</span>)}
        {insight.optimizationGoals.map((item) => <span key={item} className="rounded-full bg-white/5 px-2 py-1">{item}</span>)}
      </div>
      <div className="mt-3 space-y-1">
        {insight.exampleCreativeIds.map((creativeId, index) => (
          <Link key={creativeId} href={`/clients/${clientId}/creatives/${creativeId}`} className="block truncate text-xs text-primary hover:text-white">
            {insight.exampleCreativeNames[index] ?? creativeId}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ContextBlock({ title, items }: { title: string; items: string[] }) {
  const tCommon = useTranslations("common");
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-[0.16em] text-white/45">{title}</p>
      {items.length === 0 ? <p className="text-white/45">{tCommon("noData")}</p> : <div className="flex flex-wrap gap-2">{items.map((item) => <span key={item} className="rounded-full bg-white/5 px-2 py-1 text-xs">{item}</span>)}</div>}
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className={className}><p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-1 text-white/70">{value}</p></div>;
}

function contextItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === "object" && "label" in item) {
      const record = item as { label?: unknown; count?: unknown };
      return `${String(record.label ?? "")} (${formatNumber(Number(record.count ?? 0))})`;
    }
    return String(item);
  }).filter(Boolean);
}

function contextStrings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
