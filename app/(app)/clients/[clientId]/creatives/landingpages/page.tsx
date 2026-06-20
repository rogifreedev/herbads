import Link from "next/link";
import { FormField } from "@/components/form-field";
import { LandingpageAnalysisButton } from "@/components/landingpage-analysis-button";
import { LandingpagesDataTable } from "@/components/landingpages-data-table";
import { MetaAdsTabs } from "@/components/meta-ads-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listClientLandingpages, type LandingpageListItem } from "@/lib/landingpages";
import { formatCurrency, formatDecimal, formatNumber } from "@/lib/metrics";

type SearchParams = Record<string, string | string[] | undefined>;
type SortKey = "spend" | "roas" | "match" | "ads" | "url";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const normalized = firstParam(value)?.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortValue(landingpage: LandingpageListItem, sort: SortKey) {
  if (sort === "roas") return landingpage.metrics.roas ?? -1;
  if (sort === "match") return landingpage.matchScore ?? -1;
  if (sort === "ads") return landingpage.adCount;
  if (sort === "url") return landingpage.displayUrl.toLowerCase();
  return landingpage.metrics.spend;
}

function filterLandingpages(landingpages: LandingpageListItem[], searchParams: SearchParams) {
  const query = firstParam(searchParams.q)?.trim().toLowerCase() ?? "";
  const signal = firstParam(searchParams.signal)?.toUpperCase() ?? "ALL";
  const minSpend = numberParam(searchParams.minSpend);
  const minRoas = numberParam(searchParams.minRoas);
  const minMatch = numberParam(searchParams.minMatch);
  const rawSort = firstParam(searchParams.sort)?.toLowerCase();
  const sort: SortKey = rawSort === "roas" || rawSort === "match" || rawSort === "ads" || rawSort === "url" ? rawSort : "spend";

  const filtered = landingpages
    .filter((landingpage) => signal === "ALL" || landingpage.signal === signal)
    .filter((landingpage) => (minSpend === null ? true : landingpage.metrics.spend >= minSpend))
    .filter((landingpage) => (minRoas === null ? true : (landingpage.metrics.roas ?? -1) >= minRoas))
    .filter((landingpage) => (minMatch === null ? true : (landingpage.matchScore ?? -1) >= minMatch))
    .filter((landingpage) => {
      if (!query) return true;
      return [landingpage.url, landingpage.displayUrl, landingpage.bestAd?.name, landingpage.signal].some((value) => value?.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      if (sort === "url") return String(sortValue(a, sort)).localeCompare(String(sortValue(b, sort)));
      return Number(sortValue(b, sort)) - Number(sortValue(a, sort));
    });

  return { filtered, filters: { query, signal, minSpend, minRoas, minMatch, sort } };
}

export default async function ClientLandingpagesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const { landingpages, error } = await listClientLandingpages(clientId);
  const { filtered, filters } = filterLandingpages(landingpages, resolvedSearchParams);
  const signalCounts = landingpages.reduce<Record<string, number>>((counts, landingpage) => {
    counts[landingpage.signal] = (counts[landingpage.signal] ?? 0) + 1;
    return counts;
  }, {});
  const hasActiveFilters = filters.signal !== "ALL" || Boolean(filters.query) || filters.minSpend !== null || filters.minRoas !== null || filters.minMatch !== null || filters.sort !== "spend";
  const totals = filtered.reduce(
    (sum, landingpage) => ({
      adCount: sum.adCount + landingpage.adCount,
      spend: sum.spend + landingpage.metrics.spend,
      purchaseValue: sum.purchaseValue + landingpage.metrics.purchaseValue
    }),
    { adCount: 0, spend: 0, purchaseValue: 0 }
  );
  const roas = totals.spend > 0 ? totals.purchaseValue / totals.spend : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Landingpages</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Alle Landingpage-URLs aus den Meta Creatives, aggregiert nach Ads, Spend, ROAS und Landingpage/Ad-Match. Nach dem Crawl nutzt Match echte Landingpage-Signale statt nur Creative-AI-Scores.
          </p>
        </div>
        <LandingpageAnalysisButton clientId={clientId} urls={filtered.map((landingpage) => landingpage.url)} />
      </div>

      <MetaAdsTabs clientId={clientId} active="landingpages" />

      {error ? (
        <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Landingpages" value={`${formatNumber(filtered.length)} / ${formatNumber(landingpages.length)}`} />
        <Metric label="Ads" value={formatNumber(totals.adCount)} />
        <Metric label="SPENT" value={formatCurrency(totals.spend)} />
        <Metric label="ROAS" value={formatDecimal(roas)} />
      </div>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Filter</CardTitle>
              <p className="mt-2 text-sm text-white/55">
                {filtered.length} von {landingpages.length} Landingpages sichtbar
              </p>
            </div>
            {hasActiveFilters ? (
              <Button asChild variant="outline" className="border-herb-border">
                <Link href={`/clients/${clientId}/creatives/landingpages`}>Filter zuruecksetzen</Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            <FormField label="Suche" className="md:col-span-2 xl:col-span-2">
              <Input
                name="q"
                defaultValue={filters.query}
                placeholder="URL, Best AD, Signal"
              />
            </FormField>
            <FormField label="Signal">
              <Select name="signal" defaultValue={filters.signal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Alle ({landingpages.length})</SelectItem>
                  <SelectItem value="GOOD">GOOD ({signalCounts.GOOD ?? 0})</SelectItem>
                  <SelectItem value="WATCH">WATCH ({signalCounts.WATCH ?? 0})</SelectItem>
                  <SelectItem value="BLEED">BLEED ({signalCounts.BLEED ?? 0})</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Sortierung">
              <Select name="sort" defaultValue={filters.sort}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spend">SPENT</SelectItem>
                  <SelectItem value="roas">ROAS</SelectItem>
                  <SelectItem value="match">Match</SelectItem>
                  <SelectItem value="ads">Anzahl Ads</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Min. Spend">
              <Input
                name="minSpend"
                defaultValue={filters.minSpend ?? ""}
                inputMode="decimal"
                placeholder="100"
              />
            </FormField>
            <FormField label="Min. ROAS">
              <Input
                name="minRoas"
                defaultValue={filters.minRoas ?? ""}
                inputMode="decimal"
                placeholder="2.0"
              />
            </FormField>
            <FormField label="Min. Match">
              <Input
                name="minMatch"
                defaultValue={filters.minMatch ?? ""}
                inputMode="numeric"
                placeholder="70"
              />
            </FormField>
            <div className="flex items-end md:col-span-2 xl:col-span-1">
              <Button type="submit" className="w-full">Anwenden</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Landingpage Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <LandingpagesDataTable clientId={clientId} landingpages={filtered} emptyLabel={landingpages.length === 0 ? "Keine Landingpage-URLs gefunden. Fuehre zuerst den Meta Sync aus oder pruefe, ob Creatives Landing URLs enthalten." : "Keine Treffer. Passe Suche oder Filter an."} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-herb-border bg-herb-surface/90 p-4">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-2 font-heading text-3xl text-white">{value}</p>
    </div>
  );
}
