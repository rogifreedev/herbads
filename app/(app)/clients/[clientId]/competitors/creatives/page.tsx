import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CompetitorBulkAnalyzeButton } from "@/components/competitor-intelligence-actions";
import { CompetitorIntelligenceControls, type CompetitorIntelligenceTab } from "@/components/competitor-intelligence-controls";
import { CompetitorCreativesTable } from "@/components/competitor-creatives-table";
import { CompetitorSectionNav } from "@/components/competitor-section-nav";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeCompetitorAngle } from "@/lib/competitor-angles";
import { competitorCreativeStatusLabel, isCompetitorCreativeDisabled } from "@/lib/competitor-creative-status";
import { getCompetitorReachBreakdown, getCompetitorReachByGender, getCompetitorReachByLocation, normalizeCompetitorGender } from "@/lib/competitor-demographics";
import { getCompetitorOverview, type Competitor, type CompetitorCreative } from "@/lib/competitors";
import type { CreativeEmotionScores } from "@/lib/creative-ai";
import type { Translator } from "@/lib/i18n-types";
import { displayLandingUrl, normalizeLandingUrl } from "@/lib/landingpage-utils";
import { formatCurrency, formatDate, formatNumber } from "@/lib/metrics";
import { resolveInsightDateFilters } from "@/lib/date-filters";

type SearchParams = Record<string, string | string[] | undefined>;

type CompetitorCreativeGroup = {
  competitorId: string | null;
  competitorName: string;
  crawlEnabled: boolean;
  creatives: CompetitorCreative[];
};

type OverviewMetrics = {
  totalReach: number;
  totalSpend: number;
  topCountry: { location: string; reach: number } | null;
  topAge: { ageRange: string; reach: number } | null;
  countries: Array<{ location: string; reach: number }>;
  ages: Array<{ ageRange: string; reach: number }>;
  genders: Array<{ gender: string; reach: number }>;
  femaleReach: number;
  maleReach: number;
  firstFoundAt: string | null;
  latestFoundAt: string | null;
  latestSeenAt: string | null;
};

type AngleRow = {
  angle: string;
  count: number;
  reach: number;
  estimatedSpend: number;
  estimatedDailySpend: number;
  averageScore: number | null;
  topEmotion: string;
  competitors: string[];
  variants: string[];
  thesis: string | null;
};

type LandingpageRow = {
  url: string;
  displayUrl: string;
  adCount: number;
  activeAds: number;
  disabledAds: number;
  reach: number;
  estimatedSpend: number;
  estimatedDailySpend: number;
  avgActiveDays: number | null;
  firstStartedAt: string | null;
  latestSeenAt: string | null;
  topCreative: CompetitorCreative | null;
  topAngle: string | null;
  topOffer: string | null;
  topCta: string | null;
  competitors: string[];
};

export default async function CompetitorCreativesPage({
  params,
  searchParams
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const t = await getTranslations("competitors");
  const tCommon = await getTranslations("common");
  const overview = await getCompetitorOverview(clientId);
  const dateFilters = resolveInsightDateFilters(resolvedSearchParams, 30);
  const activeTab = resolveTab(firstParam(resolvedSearchParams.tab));
  const selectedCompetitorId = resolveCompetitorId(firstParam(resolvedSearchParams.competitor), overview.competitors);
  const selectedCompetitor = selectedCompetitorId ? overview.competitors.find((competitor) => competitor.id === selectedCompetitorId) ?? null : null;
  const competitorCreatives = selectedCompetitorId ? overview.creatives.filter((creative) => creative.competitorId === selectedCompetitorId) : overview.creatives;
  const filteredCreatives = dateFilters.dateError ? [] : competitorCreatives.filter((creative) => creativeWasActiveInRange(creative, dateFilters.since, dateFilters.until));
  const groups = groupCreativesByCompetitor(overview.competitors, filteredCreatives);
  const overviewMetrics = buildOverviewMetrics(filteredCreatives);
  const angleRows = buildAngleRows(filteredCreatives);
  const landingpageRows = buildLandingpageRows(filteredCreatives);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Competitor Intelligence</h2>
          <p className="mt-2 text-sm text-white/60">
            {selectedCompetitor ? `${selectedCompetitor.name}: ` : ""}
            {t("intelligenceSubtitle")}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <CreativeDateRangePicker defaultDays={30} />
          <CompetitorSectionNav clientId={clientId} active="creatives" />
        </div>
      </div>

      {overview.error ? (
        <Alert variant="warning">
          <AlertDescription>{overview.error}</AlertDescription>
        </Alert>
      ) : null}
      {dateFilters.dateError ? <Alert variant="warning"><AlertDescription>{tCommon("dateRangeError")}</AlertDescription></Alert> : null}

      <CompetitorIntelligenceControls
        activeTab={activeTab}
        competitors={overview.competitors.map((competitor) => ({ id: competitor.id, name: competitor.name }))}
        selectedCompetitorId={selectedCompetitorId}
      />

      {activeTab === "overview" ? (
        <OverviewTab
          metrics={overviewMetrics}
          competitorCount={selectedCompetitorId ? 1 : overview.competitors.length}
          creativeCount={filteredCreatives.length}
          analyzedCount={filteredCreatives.filter((creative) => creative.analysis).length}
          t={t}
        />
      ) : null}

      {activeTab === "creatives" ? <CreativesTab clientId={clientId} groups={groups} creatives={filteredCreatives} t={t} /> : null}

      {activeTab === "angles" ? <AnglesTab rows={angleRows} t={t} /> : null}

      {activeTab === "landingpages" ? <LandingpagesTab clientId={clientId} rows={landingpageRows} t={t} /> : null}
    </div>
  );
}

function OverviewTab({
  metrics,
  competitorCount,
  creativeCount,
  analyzedCount,
  t
}: {
  metrics: OverviewMetrics;
  competitorCount: number;
  creativeCount: number;
  analyzedCount: number;
  t: Translator;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard label={t("totalReach")} value={metrics.totalReach > 0 ? formatNumber(metrics.totalReach) : "–"} />
        <SummaryCard label={t("totalSpent")} value={formatCurrency(metrics.totalSpend)} />
        <SummaryCard label={t("countryReach")} value={metrics.topCountry ? metrics.topCountry.location : "–"} detail={metrics.topCountry ? formatNumber(metrics.topCountry.reach) : t("noEuData")} />
        <SummaryCard label={t("topAgeReach")} value={metrics.topAge ? metrics.topAge.ageRange : "–"} detail={metrics.topAge ? formatNumber(metrics.topAge.reach) : t("noEuData")} />
        <SummaryCard label="Female Reach" value={metrics.femaleReach > 0 ? formatNumber(metrics.femaleReach) : "–"} />
        <SummaryCard label="Male Reach" value={metrics.maleReach > 0 ? formatNumber(metrics.maleReach) : "–"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Scope</CardTitle>
            <CardDescription>{t("scopeDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <MetricRow label="Competitors" value={formatNumber(competitorCount)} />
            <MetricRow label="Creatives" value={formatNumber(creativeCount)} />
            <MetricRow label={t("analyzed")} value={formatNumber(analyzedCount)} />
            <MetricRow label={t("firstFound")} value={formatDate(metrics.firstFoundAt)} />
            <MetricRow label={t("latestFound")} value={formatDate(metrics.latestFoundAt)} />
            <MetricRow label={t("lastSeen")} value={formatDate(metrics.latestSeenAt)} />
          </CardContent>
        </Card>

        <ReachTable
          title={t("countryReach")}
          columnLabel={t("countriesLabel")}
          description={t("countryReachDescription")}
          emptyLabel={t("noCountryReachData")}
          rows={metrics.countries.map((country) => ({ label: country.location, value: country.reach }))}
        />

        <ReachTable
          title={t("ageReach")}
          columnLabel={t("ageLabel")}
          description={t("ageReachDescription")}
          emptyLabel={t("noAgeReachData")}
          rows={metrics.ages.map((age) => ({ label: age.ageRange, value: age.reach }))}
        />

        <ReachTable
          title="Gender Reach"
          columnLabel="Gender"
          description={t("genderReachDescription")}
          emptyLabel={t("noGenderReachData")}
          rows={metrics.genders.map((gender) => ({ label: gender.gender, value: gender.reach }))}
        />
      </section>
    </div>
  );
}

function CreativesTab({ clientId, groups, creatives, t }: { clientId: string; groups: CompetitorCreativeGroup[]; creatives: CompetitorCreative[]; t: Translator }) {
  return (
    <div className="space-y-6">
      {groups.length === 0 ? (
        <Card className="border-herb-border bg-herb-surface/90">
          <CardContent className="p-6">
            <EmptyState title={t("noCompetitorCreatives")} description={t("noCompetitorCreativesDescription")} />
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
                  <Badge variant={group.crawlEnabled ? "success" : "secondary"}>{group.crawlEnabled ? t("crawlConnected") : t("notConnected")}</Badge>
                </div>
                <CardDescription className="mt-2">
                  {t("groupStats", {
                    ads: formatNumber(group.creatives.length),
                    spend: formatCurrency(sumSpend(group.creatives)),
                    analyzed: formatNumber(group.creatives.filter((creative) => creative.analysis).length)
                  })}
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
          <CardDescription>{t("creativeGridDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 2xl:grid-cols-4">
          {creatives.length === 0 ? (
            <EmptyState className="col-span-full" title={t("noCrawledAds")} description={t("noCrawledAdsDescription")} />
          ) : null}
          {creatives.slice(0, 72).map((creative) => (
            <GridCreativeCard key={creative.id} clientId={clientId} creative={creative} t={t} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AnglesTab({ rows, t }: { rows: AngleRow[]; t: Translator }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>Angles</CardTitle>
        <CardDescription>{t("anglesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title={t("noAnglesAnalyzed")} description={t("noAnglesDescription")} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-herb-border">
            <table className="min-w-[1280px] w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-white/45">
                <tr>
                  <th className="px-4 py-3">Angle</th>
                  <th className="px-4 py-3">Ads</th>
                  <th className="px-4 py-3">Reach</th>
                  <th className="px-4 py-3">Spent</th>
                  <th className="px-4 py-3">Daily</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Emotion</th>
                  <th className="px-4 py-3">Competitors</th>
                  <th className="px-4 py-3">{t("variantsColumn")}</th>
                  <th className="px-4 py-3">Thesis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-herb-border">
                {rows.map((row) => (
                  <tr key={row.angle} className="align-top">
                    <td className="px-4 py-4 font-medium text-white">{row.angle}</td>
                    <td className="px-4 py-4 text-white/70">{formatNumber(row.count)}</td>
                    <td className="px-4 py-4 text-white/70">{row.reach > 0 ? formatNumber(row.reach) : "–"}</td>
                    <td className="px-4 py-4 text-white/70">{formatCurrency(row.estimatedSpend)}</td>
                    <td className="px-4 py-4 text-white/70">{formatCurrency(row.estimatedDailySpend)}</td>
                    <td className="px-4 py-4 text-white/70">{row.averageScore === null ? "–" : `${formatNumber(row.averageScore)}/100`}</td>
                    <td className="px-4 py-4">
                      <Badge variant="secondary">{row.topEmotion}</Badge>
                    </td>
                    <td className="px-4 py-4 text-white/70">{row.competitors.join(", ")}</td>
                    <td className="max-w-[280px] px-4 py-4 text-white/60">{row.variants.length > 0 ? row.variants.join(", ") : "–"}</td>
                    <td className="max-w-[360px] px-4 py-4 text-white/65">{row.thesis ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LandingpagesTab({ clientId, rows, t }: { clientId: string; rows: LandingpageRow[]; t: Translator }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>Landingpages</CardTitle>
        <CardDescription>{t("landingpagesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title={t("noLandingpagesFound")} description={t("noLandingpagesDescription")} />
        ) : (
          <div className="max-h-[680px] overflow-auto rounded-xl border border-herb-border">
            <table className="min-w-[1360px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-herb-surface text-xs uppercase tracking-[0.16em] text-white/45">
                <tr>
                  <th className="px-4 py-3">Landingpage</th>
                  <th className="px-4 py-3 text-right">Reach</th>
                  <th className="px-4 py-3 text-right">Spent</th>
                  <th className="px-4 py-3 text-right">Daily</th>
                  <th className="px-4 py-3 text-right">Ads</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Top Creative</th>
                  <th className="px-4 py-3">Angle</th>
                  <th className="px-4 py-3">Offer</th>
                  <th className="px-4 py-3">CTA</th>
                  <th className="px-4 py-3">Competitors</th>
                  <th className="px-4 py-3 text-right">{t("avgDaysColumn")}</th>
                  <th className="px-4 py-3">{t("firstStart")}</th>
                  <th className="px-4 py-3">{t("lastSeen")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-herb-border">
                {rows.map((row) => (
                  <tr key={row.url} className="align-top">
                    <td className="px-4 py-4">
                      <Link href={row.url} target="_blank" className="block max-w-[260px] truncate font-medium text-primary hover:text-white">
                        {row.displayUrl}
                      </Link>
                      <p className="mt-1 max-w-[260px] truncate text-xs text-white/40">{row.url}</p>
                    </td>
                    <td className="px-4 py-4 text-right text-white">{row.reach > 0 ? formatNumber(row.reach) : "–"}</td>
                    <td className="px-4 py-4 text-right text-white/70">{formatCurrency(row.estimatedSpend)}</td>
                    <td className="px-4 py-4 text-right text-white/70">{formatCurrency(row.estimatedDailySpend)}</td>
                    <td className="px-4 py-4 text-right text-white/70">{formatNumber(row.adCount)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {row.activeAds > 0 ? <Badge variant="success">{t("activeCount", { count: formatNumber(row.activeAds) })}</Badge> : null}
                        {row.disabledAds > 0 ? <Badge variant="destructive">{t("disabledCount", { count: formatNumber(row.disabledAds) })}</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {row.topCreative ? (
                        <Link href={`/clients/${clientId}/competitors/creatives/${row.topCreative.id}`} className="line-clamp-2 max-w-[260px] font-medium text-white hover:text-primary">
                          {row.topCreative.analysis?.hook ?? row.topCreative.hook ?? row.topCreative.headline ?? t("viewCreative")}
                        </Link>
                      ) : (
                        <span className="text-white/55">–</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-white/70">{row.topAngle ?? "–"}</td>
                    <td className="max-w-[220px] px-4 py-4 text-white/65">{row.topOffer ?? "–"}</td>
                    <td className="px-4 py-4 text-white/70">{row.topCta ?? "–"}</td>
                    <td className="max-w-[260px] px-4 py-4 text-white/70">{row.competitors.join(", ")}</td>
                    <td className="px-4 py-4 text-right text-white/70">{row.avgActiveDays === null ? "–" : formatNumber(row.avgActiveDays)}</td>
                    <td className="px-4 py-4 text-white/70">{formatDate(row.firstStartedAt)}</td>
                    <td className="px-4 py-4 text-white/70">{formatDate(row.latestSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
        <p className="mt-2 font-heading text-3xl text-white">{value}</p>
        {detail ? <p className="mt-1 text-sm text-white/55">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 font-heading text-2xl text-white">{value}</p>
    </div>
  );
}

function ReachTable({
  title,
  columnLabel,
  description,
  rows,
  emptyLabel
}: {
  title: string;
  columnLabel: string;
  description: string;
  rows: Array<{ label: string; value: number }>;
  emptyLabel: string;
}) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-herb-border bg-black/20 p-4 text-sm text-white/55">{emptyLabel}</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-xl border border-herb-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-herb-surface text-xs uppercase tracking-[0.16em] text-white/45">
                <tr>
                  <th className="px-4 py-3">{columnLabel}</th>
                  <th className="px-4 py-3 text-right">Reach</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-herb-border">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-3 text-white">{row.label}</td>
                    <td className="px-4 py-3 text-right text-white/70">{formatNumber(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GridCreativeCard({ clientId, creative, t }: { clientId: string; creative: CompetitorCreative; t: Translator }) {
  return (
    <Link href={`/clients/${clientId}/competitors/creatives/${creative.id}`} className="group rounded-2xl border border-herb-border bg-black/30 p-4 transition hover:border-primary/60">
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,rgba(229,31,118,0.18),transparent_42%),#1f2937]">
        {creative.thumbnailUrl || creative.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creative.thumbnailUrl ?? creative.imageUrl ?? ""} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
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
          <Badge variant={isCompetitorCreativeDisabled(creative.status) ? "destructive" : "success"}>{competitorCreativeStatusLabel(creative.status, t)}</Badge>
        </div>
        <p className="line-clamp-2 font-medium text-white">{creative.analysis?.hook ?? creative.hook ?? creative.headline ?? t("noHook")}</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
          <span>Reach {creative.reachEstimate ? formatNumber(creative.reachEstimate) : "–"}</span>
          <span>Spend {formatCurrency(creative.estimatedSpend ?? 0)}</span>
          <span>Start {formatDate(creative.startedAt)}</span>
          <span>{t("found")} {formatDate(creative.createdAt)}</span>
          <span>{t("seen")} {formatDate(creative.lastSeenAt)}</span>
          <span>Score {creative.rankingScore}/100</span>
        </div>
      </div>
    </Link>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTab(value: string | undefined): CompetitorIntelligenceTab {
  if (value === "creatives" || value === "angles" || value === "landingpages") return value;
  return "overview";
}

function resolveCompetitorId(value: string | undefined, competitors: Competitor[]) {
  if (!value) return null;
  return competitors.some((competitor) => competitor.id === value) ? value : null;
}

function creativeWasActiveInRange(creative: CompetitorCreative, since: string | null, until: string | null) {
  const startedAt = (creative.startedAt ?? creative.createdAt).slice(0, 10);
  const endedAt = creative.endedAt?.slice(0, 10) ?? null;
  if (since && endedAt && endedAt < since) return false;
  if (until && startedAt > until) return false;
  return true;
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

function reachValue(creative: CompetitorCreative) {
  const euReach = Number(creative.demographicSignals.euReach);
  if (Number.isFinite(euReach) && euReach > 0) return euReach;
  return creative.reachEstimate ?? creative.reachMax ?? creative.reachMin ?? 0;
}

function buildOverviewMetrics(creatives: CompetitorCreative[]): OverviewMetrics {
  const countries = new Map<string, number>();
  const ages = new Map<string, number>();
  const genders = new Map<string, number>();
  const createdDates = creatives.map((creative) => creative.createdAt).filter(Boolean).sort();
  const seenDates = creatives.map((creative) => creative.lastSeenAt).filter(Boolean).sort();

  for (const creative of creatives) {
    const reach = reachValue(creative);
    const locationRows = getCompetitorReachByLocation(creative.demographicSignals);
    if (locationRows.length > 0) {
      for (const row of locationRows) {
        countries.set(row.location, (countries.get(row.location) ?? 0) + row.reach);
      }
    } else if (reach > 0 && creative.audienceLocations.length > 0) {
      const splitReach = Math.round(reach / creative.audienceLocations.length);
      for (const location of creative.audienceLocations) {
        countries.set(location, (countries.get(location) ?? 0) + splitReach);
      }
    }

    const ageRows = aggregateAgeRows(creative);
    if (ageRows.length > 0) {
      for (const row of ageRows) {
        ages.set(row.ageRange, (ages.get(row.ageRange) ?? 0) + row.reach);
      }
    } else if (reach > 0 && creative.ageRanges.length > 0) {
      const splitReach = Math.round(reach / creative.ageRanges.length);
      for (const ageRange of creative.ageRanges) {
        ages.set(ageRange, (ages.get(ageRange) ?? 0) + splitReach);
      }
    }

    const genderRows = aggregateGenderRows(creative);
    if (genderRows.length > 0) {
      for (const row of genderRows) {
        genders.set(row.gender, (genders.get(row.gender) ?? 0) + row.reach);
      }
    } else if (reach > 0 && creative.genderSignals.length > 0) {
      const normalizedGenders = Array.from(new Set(creative.genderSignals.map((gender) => normalizeCompetitorGender(gender)))).filter((gender) => gender !== "All");
      if (normalizedGenders.length > 0) {
        const splitReach = Math.round(reach / normalizedGenders.length);
        for (const gender of normalizedGenders) {
          genders.set(gender, (genders.get(gender) ?? 0) + splitReach);
        }
      }
    }
  }

  const countryRows = Array.from(countries.entries())
    .map(([location, reach]) => ({ location, reach }))
    .filter((row) => row.reach > 0)
    .sort((a, b) => b.reach - a.reach || a.location.localeCompare(b.location));
  const ageRows = Array.from(ages.entries())
    .map(([ageRange, reach]) => ({ ageRange, reach }))
    .filter((row) => row.reach > 0)
    .sort((a, b) => b.reach - a.reach || a.ageRange.localeCompare(b.ageRange));
  const genderRows = Array.from(genders.entries())
    .map(([gender, reach]) => ({ gender, reach }))
    .filter((row) => row.reach > 0)
    .sort((a, b) => genderSortValue(a.gender) - genderSortValue(b.gender) || b.reach - a.reach || a.gender.localeCompare(b.gender));

  return {
    totalReach: creatives.reduce((sum, creative) => sum + reachValue(creative), 0),
    totalSpend: sumSpend(creatives),
    topCountry: countryRows[0] ?? null,
    topAge: ageRows[0] ?? null,
    countries: countryRows,
    ages: ageRows,
    genders: genderRows,
    femaleReach: genderRows.find((row) => row.gender === "Female")?.reach ?? 0,
    maleReach: genderRows.find((row) => row.gender === "Male")?.reach ?? 0,
    firstFoundAt: createdDates[0] ?? null,
    latestFoundAt: createdDates.at(-1) ?? null,
    latestSeenAt: seenDates.at(-1) ?? null
  };
}

function aggregateAgeRows(creative: CompetitorCreative) {
  const rows = getCompetitorReachBreakdown(creative.demographicSignals);
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.ageRange || row.ageRange === "-") continue;
    totals.set(row.ageRange, (totals.get(row.ageRange) ?? 0) + row.reach);
  }

  return Array.from(totals.entries()).map(([ageRange, reach]) => ({ ageRange, reach }));
}

function aggregateGenderRows(creative: CompetitorCreative) {
  return getCompetitorReachByGender(creative.demographicSignals);
}

function genderSortValue(gender: string) {
  if (gender === "Female") return 0;
  if (gender === "Male") return 1;
  if (gender === "Unknown") return 2;
  if (gender === "All") return 3;
  return 4;
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

function buildAngleRows(creatives: CompetitorCreative[]): AngleRow[] {
  const rows = new Map<
    string,
    {
      angle: string;
      count: number;
      reach: number;
      estimatedSpend: number;
      estimatedDailySpend: number;
      scoreTotal: number;
      scoreCount: number;
      thesis: string | null;
      competitors: Set<string>;
      variants: Set<string>;
      emotionTotals: Record<keyof CreativeEmotionScores, number>;
      emotionCounts: Record<keyof CreativeEmotionScores, number>;
    }
  >();
  const emotionKeys: Array<keyof CreativeEmotionScores> = ["curiosity", "desire", "trust", "urgency", "joy", "fearOfMissingOut"];

  for (const creative of creatives) {
    const rawAngle = creative.analysis?.angle?.trim() || "";
    const angle = canonicalCompetitorAngle(rawAngle);
    const row = rows.get(angle) ?? {
      angle,
      count: 0,
      reach: 0,
      estimatedSpend: 0,
      estimatedDailySpend: 0,
      scoreTotal: 0,
      scoreCount: 0,
      thesis: null,
      competitors: new Set<string>(),
      variants: new Set<string>(),
      emotionTotals: { curiosity: 0, desire: 0, trust: 0, urgency: 0, joy: 0, fearOfMissingOut: 0 },
      emotionCounts: { curiosity: 0, desire: 0, trust: 0, urgency: 0, joy: 0, fearOfMissingOut: 0 }
    };
    const scores = normalizeEmotionScores(creative.analysis?.emotionScores ?? {});
    row.count += 1;
    row.reach += reachValue(creative);
    row.estimatedSpend += creative.estimatedSpend ?? 0;
    row.estimatedDailySpend += creative.estimatedDailySpend ?? 0;
    row.thesis ??= creative.analysis?.thesis ?? creative.analysis?.hypotheses?.[0] ?? null;
    row.competitors.add(creative.competitorName);
    if (rawAngle && rawAngle !== angle) row.variants.add(rawAngle);

    if (creative.analysis?.rankingScore !== null && creative.analysis?.rankingScore !== undefined) {
      row.scoreTotal += creative.analysis.rankingScore;
      row.scoreCount += 1;
    }

    for (const key of emotionKeys) {
      const value = scores[key];
      if (value === null) continue;
      row.emotionTotals[key] += value;
      row.emotionCounts[key] += 1;
    }

    rows.set(angle, row);
  }

  return Array.from(rows.values())
    .filter((row) => row.angle !== "Unclassified")
    .map((row) => {
      const topEmotion = emotionKeys
        .map((key) => ({
          key,
          value: row.emotionCounts[key] > 0 ? row.emotionTotals[key] / row.emotionCounts[key] : 0
        }))
        .sort((a, b) => b.value - a.value)[0]?.key ?? "curiosity";

      return {
        angle: row.angle,
        count: row.count,
        reach: row.reach,
        estimatedSpend: row.estimatedSpend,
        estimatedDailySpend: row.estimatedDailySpend,
        averageScore: row.scoreCount > 0 ? Math.round(row.scoreTotal / row.scoreCount) : null,
        topEmotion: topEmotion === "fearOfMissingOut" ? "FOMO" : topEmotion,
        competitors: Array.from(row.competitors).sort((a, b) => a.localeCompare(b)),
        variants: Array.from(row.variants).sort((a, b) => a.localeCompare(b)).slice(0, 6),
        thesis: row.thesis
      };
    })
    .sort((a, b) => b.estimatedSpend - a.estimatedSpend || b.reach - a.reach || b.count - a.count);
}

function buildLandingpageRows(creatives: CompetitorCreative[]): LandingpageRow[] {
  const rows = new Map<
    string,
    {
      url: string;
      creatives: CompetitorCreative[];
      competitors: Set<string>;
    }
  >();

  for (const creative of creatives) {
    const url = normalizeLandingUrl(creative.landingUrl);
    if (!url) continue;
    const row = rows.get(url) ?? { url, creatives: [], competitors: new Set<string>() };
    row.creatives.push(creative);
    row.competitors.add(creative.competitorName);
    rows.set(url, row);
  }

  return Array.from(rows.values())
    .map((row) => {
      const sortedCreatives = [...row.creatives].sort(compareCreativesByImportance);
      const topCreative = sortedCreatives[0] ?? null;
      const activeDays = row.creatives
        .map((creative) => creative.activeDays)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      return {
        url: row.url,
        displayUrl: displayLandingUrl(row.url),
        adCount: row.creatives.length,
        activeAds: row.creatives.filter((creative) => !isCompetitorCreativeDisabled(creative.status)).length,
        disabledAds: row.creatives.filter((creative) => isCompetitorCreativeDisabled(creative.status)).length,
        reach: row.creatives.reduce((sum, creative) => sum + reachValue(creative), 0),
        estimatedSpend: sumSpend(row.creatives),
        estimatedDailySpend: row.creatives.reduce((sum, creative) => sum + (creative.estimatedDailySpend ?? 0), 0),
        avgActiveDays: activeDays.length > 0 ? Math.round(activeDays.reduce((sum, value) => sum + value, 0) / activeDays.length) : null,
        firstStartedAt: earliestDate(row.creatives.map((creative) => creative.startedAt)),
        latestSeenAt: latestDate(row.creatives.map((creative) => creative.lastSeenAt)),
        topCreative,
        topAngle: mostImportantTextValue(row.creatives, (creative) => (creative.analysis?.angle ? canonicalCompetitorAngle(creative.analysis.angle) : null)),
        topOffer: topCreative?.analysis?.offer ?? mostImportantTextValue(row.creatives, (creative) => creative.analysis?.offer),
        topCta: mostImportantTextValue(row.creatives, (creative) => creative.cta),
        competitors: Array.from(row.competitors).sort((a, b) => a.localeCompare(b))
      };
    })
    .sort((a, b) => b.reach - a.reach || b.estimatedSpend - a.estimatedSpend || b.adCount - a.adCount || a.displayUrl.localeCompare(b.displayUrl));
}

function canonicalCompetitorAngle(value: string | null | undefined) {
  const angle = value?.trim();
  if (!angle) return "Unclassified";
  return normalizeCompetitorAngle(angle) ?? angle;
}

function compareCreativesByImportance(a: CompetitorCreative, b: CompetitorCreative) {
  return reachValue(b) - reachValue(a) || (b.estimatedSpend ?? 0) - (a.estimatedSpend ?? 0) || b.rankingScore - a.rankingScore;
}

function mostImportantTextValue(creatives: CompetitorCreative[], selector: (creative: CompetitorCreative) => string | null | undefined) {
  const totals = new Map<string, number>();
  for (const creative of creatives) {
    const value = selector(creative)?.trim();
    if (!value) continue;
    totals.set(value, (totals.get(value) ?? 0) + reachValue(creative));
  }

  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function earliestDate(values: Array<string | null>) {
  return values.filter(Boolean).sort()[0] ?? null;
}

function latestDate(values: Array<string | null>) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}
