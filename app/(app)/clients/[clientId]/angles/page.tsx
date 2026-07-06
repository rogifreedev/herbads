import { getTranslations } from "next-intl/server";
import { AdsetAnglesDataTable, AngleRankingDataTable } from "@/components/angle-ranking-data-table";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { EmptyState } from "@/components/empty-state";
import { MetaAdsTabs } from "@/components/meta-ads-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCreativeAnglesOverview } from "@/lib/creative-angles";
import { formatNumber } from "@/lib/metrics";

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
  const isAllRange = firstParam(searchParams.range) === "all";
  const hasExplicitDateRange = Boolean(firstParam(searchParams.since) || firstParam(searchParams.until));
  const since = isAllRange ? null : dateParam(searchParams.since) ?? (hasExplicitDateRange ? null : dateDaysAgo(30));
  const until = isAllRange ? null : dateParam(searchParams.until) ?? (hasExplicitDateRange ? null : formatDateInput(new Date()));
  const dateError = Boolean(since && until && since > until);
  return { since, until, dateError, range: isAllRange ? "all" : null };
}

export default async function CreativeAnglesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const t = await getTranslations("angles");
  const tCommon = await getTranslations("common");
  const dateFilters = resolveDateFilters(resolvedSearchParams);
  const activeDateRange = dateFilters.dateError ? undefined : dateFilters;
  const overview = await getCreativeAnglesOverview(clientId, activeDateRange);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Adset Angles</h2>
          <p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
        </div>
        <CreativeDateRangePicker defaultDays={30} />
      </div>

      <MetaAdsTabs clientId={clientId} active="angles" />

      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}
      {dateFilters.dateError ? <Alert variant="warning"><AlertDescription>{tCommon("dateRangeError")}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="Angles" value={formatNumber(overview.totals.angles)} />
        <SummaryCard label="Adsets" value={formatNumber(overview.totals.adsets)} />
        <SummaryCard label="Creatives" value={formatNumber(overview.totals.creatives)} />
        <SummaryCard label={tCommon("aiAnalyzed")} value={formatNumber(overview.totals.analyzedCreatives)} />
        <SummaryCard label={t("avgPoints")} value={`${formatNumber(overview.totals.avgScore)}/100`} />
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Angle Ranking</CardTitle>
          <CardDescription>{t("rankingDescription")}</CardDescription>
          </CardHeader>
        <CardContent>
          {overview.angles.length === 0 ? (
            <EmptyState title={t("noAnglesTitle")} description={t("noAnglesDescription")} />
          ) : (
            <AngleRankingDataTable clientId={clientId} angles={overview.angles} />
          )}
        </CardContent>
      </Card>

      <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
          <CardTitle>{t("adsetsByAngle")}</CardTitle>
          <CardDescription>{t("adsetsByAngleDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
          {overview.adsets.length === 0 ? (
            <EmptyState title={t("noAdsetsTitle")} description={t("noAdsetsDescription")} />
          ) : (
            <AdsetAnglesDataTable clientId={clientId} adsets={overview.adsets} />
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
