"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { CreativeTypeBadge } from "@/components/creative-type-badge";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { FunnelStageBadge } from "@/components/funnel-stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { creativeRows } from "@/lib/mock-data";
import { formatCurrency, formatDate, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import type { CreativeListItem } from "@/lib/creatives";
import type { Translator } from "@/lib/i18n-types";

type CreativeRankingTableProps = {
  clientId?: string;
  creatives?: CreativeListItem[];
  title?: string;
  detailHrefSuffix?: string;
  currentPage?: number;
  pageSize?: number;
  pageHref?: (page: number) => string;
};

type SortKey = "score" | "spend" | "roas" | "ctr" | "purchases" | "cpa" | "hookRate" | "outboundCvr";

type MockCreativeRow = {
  name: string;
  type: string;
  ctr: string;
  roas: string;
  status: string;
};

function formatNullableCurrency(value: number | null) {
  return value === null ? "–" : formatCurrency(value, 2);
}

function numericInput(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function sortValue(creative: CreativeListItem, sort: SortKey) {
  if (sort === "score") return creative.performanceScore.score;
  if (sort === "roas") return creative.metrics.roas ?? -1;
  if (sort === "ctr") return creative.metrics.ctr ?? -1;
  if (sort === "purchases") return creative.metrics.purchases;
  if (sort === "cpa") return creative.metrics.costPerPurchase === null ? Number.NEGATIVE_INFINITY : -creative.metrics.costPerPurchase;
  if (sort === "hookRate") return creative.metrics.hookRate ?? -1;
  if (sort === "outboundCvr") return creative.metrics.outboundCvr ?? -1;
  return creative.metrics.spend;
}

function FilterChip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <Button type="button" variant={active ? "default" : "outline"} size="sm" className={active ? "" : "border-herb-border bg-black/15"} onClick={onClick}>
      {children}
    </Button>
  );
}

function FilterDropdown({ label, activeLabel, children }: { label: string; activeLabel?: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="border-herb-border">
          {label}{activeLabel ? `: ${activeLabel}` : ""}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-herb-border bg-herb-surface p-2 text-white">
        <div className="grid gap-2">{children}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function realColumns(t: Translator, tCommon: Translator, clientId?: string, detailHrefSuffix = ""): ColumnDef<CreativeListItem>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creative" />,
      cell: ({ row }) => {
        const creative = row.original;
        return clientId ? (
          <Link href={`/clients/${clientId}/creatives/${creative.id}${detailHrefSuffix}`} className="text-white hover:text-primary">
            {creative.name}
          </Link>
        ) : (
          <span className="text-white">{creative.name}</span>
        );
      },
      meta: { label: "Creative" }
    },
    {
      id: "score",
      accessorFn: (creative) => creative.performanceScore.score,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Score" />,
      cell: ({ row }) => (
        <div className="text-white">
          <span className="font-heading text-xl text-primary">{row.original.performanceScore.score}</span>
          <span className="ml-1 text-xs text-white/40">/100</span>
          <p className="mt-1 text-xs text-white/40">Conf. {row.original.performanceScore.confidence}%</p>
        </div>
      ),
      meta: { label: "Score" }
    },
    {
      accessorKey: "type",
      header: tCommon("type"),
      cell: ({ row }) => <CreativeTypeBadge type={row.original.type} />,
      meta: { label: tCommon("type") }
    },
    {
      accessorKey: "funnelStage",
      header: "Funnel",
      cell: ({ row }) => <FunnelStageBadge stage={row.original.funnelStage} />,
      meta: { label: "Funnel" }
    },
    {
      accessorKey: "landingUrl",
      header: "Landingpage",
      cell: ({ row }) => row.original.landingUrl ? <Link href={row.original.landingUrl} target="_blank" className="block max-w-[240px] truncate text-white/65 hover:text-primary">{row.original.landingUrl}</Link> : <span className="text-white/55">–</span>,
      meta: { label: "Landingpage" }
    },
    {
      accessorKey: "firstActiveDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("firstActive")} />,
      cell: ({ row }) => <span className="text-white">{formatDate(row.original.firstActiveDate)}</span>,
      meta: { label: t("firstActive") }
    },
    {
      id: "spend",
      accessorFn: (creative) => creative.metrics.spend,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Spend" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.metrics.spend)}</span>,
      meta: { label: "Spend" }
    },
    {
      id: "cpc",
      accessorFn: (creative) => creative.metrics.cpc ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CPC" />,
      cell: ({ row }) => <span className="text-white">{formatNullableCurrency(row.original.metrics.cpc)}</span>,
      meta: { label: "CPC" }
    },
    {
      id: "cpm",
      accessorFn: (creative) => creative.metrics.cpm ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CPM" />,
      cell: ({ row }) => <span className="text-white">{formatNullableCurrency(row.original.metrics.cpm)}</span>,
      meta: { label: "CPM" }
    },
    {
      id: "reach",
      accessorFn: (creative) => creative.metrics.reach,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reach" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.metrics.reach)}</span>,
      meta: { label: "Reach" }
    },
    {
      id: "impressions",
      accessorFn: (creative) => creative.metrics.impressions,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Impr." />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.metrics.impressions)}</span>,
      meta: { label: "Impr." }
    },
    {
      id: "purchases",
      accessorFn: (creative) => creative.metrics.purchases,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Conversions" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.metrics.purchases)}</span>,
      meta: { label: "Conversions" }
    },
    {
      id: "purchaseValue",
      accessorFn: (creative) => creative.metrics.purchaseValue,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Conv. Value" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.metrics.purchaseValue)}</span>,
      meta: { label: "Conv. Value" }
    },
    {
      id: "cpa",
      accessorFn: (creative) => creative.metrics.costPerPurchase ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CPA" />,
      cell: ({ row }) => <span className="text-white">{formatNullableCurrency(row.original.metrics.costPerPurchase)}</span>,
      meta: { label: "CPA" }
    },
    {
      id: "ctr",
      accessorFn: (creative) => creative.metrics.ctr ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CTR" />,
      cell: ({ row }) => <span className="text-primary">{formatPercent(row.original.metrics.ctr)}</span>,
      meta: { label: "CTR" }
    },
    {
      id: "hookRate",
      accessorFn: (creative) => creative.metrics.hookRate ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hook" />,
      cell: ({ row }) => <span className="text-white">{formatPercent(row.original.metrics.hookRate)}</span>,
      meta: { label: "Hook" }
    },
    {
      id: "holdRate",
      accessorFn: (creative) => creative.metrics.holdRate ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hold" />,
      cell: ({ row }) => <span className="text-white">{formatPercent(row.original.metrics.holdRate)}</span>,
      meta: { label: "Hold" }
    },
    {
      id: "outboundCvr",
      accessorFn: (creative) => creative.metrics.outboundCvr ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Outbound CVR" />,
      cell: ({ row }) => <span className="text-primary">{formatPercent(row.original.metrics.outboundCvr)}</span>,
      meta: { label: "Outbound CVR" }
    },
    {
      id: "roas",
      accessorFn: (creative) => creative.metrics.roas ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ROAS" />,
      cell: ({ row }) => <span className="text-white">{formatDecimal(row.original.metrics.roas)}</span>,
      meta: { label: "ROAS" }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant={row.original.status === "ACTIVE" ? "success" : "secondary"}>{row.original.status}</Badge>,
      meta: { label: "Status" }
    }
  ];
}

function mockColumns(tCommon: Translator): ColumnDef<MockCreativeRow>[] {
  return [
    { accessorKey: "name", header: "Creative", cell: ({ row }) => <span className="text-white">{row.original.name}</span>, meta: { label: "Creative" } },
    { accessorKey: "type", header: tCommon("type"), cell: ({ row }) => <CreativeTypeBadge type={row.original.type} />, meta: { label: tCommon("type") } },
    { accessorKey: "ctr", header: "CTR", cell: ({ row }) => <span className="text-primary">{row.original.ctr}</span>, meta: { label: "CTR" } },
    { accessorKey: "roas", header: "ROAS", cell: ({ row }) => <span className="text-white">{row.original.roas}</span>, meta: { label: "ROAS" } },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "Top Performer" ? "success" : "secondary"}>{row.original.status}</Badge>, meta: { label: "Status" } }
  ];
}

export function CreativeRankingTable({ clientId, creatives, title = "Top Creatives", detailHrefSuffix = "", currentPage = 1, pageSize = 12 }: CreativeRankingTableProps) {
  const t = useTranslations("creatives");
  const tCommon = useTranslations("common");
  const hasRealRows = Boolean(creatives);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("ALL");
  const [funnel, setFunnel] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("spend");
  const [minScore, setMinScore] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [minRoas, setMinRoas] = useState("");
  const [minCtr, setMinCtr] = useState("");
  const rows = useMemo(() => creatives ?? [], [creatives]);
  const columns = useMemo(() => realColumns(t, tCommon, clientId, detailHrefSuffix), [t, tCommon, clientId, detailHrefSuffix]);
  const sampleColumns = useMemo(() => mockColumns(tCommon), [tCommon]);
  const minScoreValue = numericInput(minScore);
  const minSpendValue = numericInput(minSpend);
  const minRoasValue = numericInput(minRoas);
  const minCtrValue = numericInput(minCtr);
  const normalizedQuery = query.trim().toLowerCase();
  const typeCounts = useMemo(() => rows.reduce<Record<string, number>>((counts, creative) => {
    counts[creative.type] = (counts[creative.type] ?? 0) + 1;
    return counts;
  }, {}), [rows]);
  const funnelCounts = useMemo(() => rows.reduce<Record<string, number>>((counts, creative) => {
    const stage = creative.funnelStage ?? "unclassified";
    counts[stage] = (counts[stage] ?? 0) + 1;
    return counts;
  }, {}), [rows]);
  const filteredRows = useMemo(() => rows
    .filter((creative) => type === "all" || creative.type.toLowerCase() === type)
    .filter((creative) => status === "ALL" || creative.status.toUpperCase() === status)
    .filter((creative) => funnel === "ALL" || creative.funnelStage?.toUpperCase() === funnel)
    .filter((creative) => minScoreValue === null || creative.performanceScore.score >= minScoreValue)
    .filter((creative) => minSpendValue === null || creative.metrics.spend >= minSpendValue)
    .filter((creative) => minRoasValue === null || (creative.metrics.roas ?? -1) >= minRoasValue)
    .filter((creative) => minCtrValue === null || (creative.metrics.ctr ?? -1) >= minCtrValue)
    .filter((creative) => {
      if (!normalizedQuery) return true;
      return [creative.name, creative.title, creative.body, creative.cta, creative.metaCreativeId, creative.funnelStage, creative.landingUrl].some((value) => value?.toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => sortValue(b, sort) - sortValue(a, sort)), [funnel, minCtrValue, minRoasValue, minScoreValue, minSpendValue, normalizedQuery, rows, sort, status, type]);
  const hasFilters = query || type !== "all" || status !== "ALL" || funnel !== "ALL" || sort !== "spend" || minScore || minSpend || minRoas || minCtr;
  const hasAdvancedFilters = minScore || minSpend || minRoas || minCtr;
  const typeLabel = type === "all" ? tCommon("all") : type[0].toUpperCase() + type.slice(1);
  const statusLabel = status === "ALL" ? tCommon("all") : status;
  const funnelLabel = funnel === "ALL" ? tCommon("all") : funnel;
  const sortLabels: Record<SortKey, string> = {
    spend: "Spend",
    score: "Score",
    roas: "ROAS",
    ctr: "CTR",
    purchases: "Conversions",
    cpa: "CPA",
    hookRate: "Hook",
    outboundCvr: "Outbound CVR"
  };

  function resetFilters() {
    setQuery("");
    setType("all");
    setStatus("ALL");
    setFunnel("ALL");
    setSort("spend");
    setMinScore("");
    setMinSpend("");
    setMinRoas("");
    setMinCtr("");
  }

  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasRealRows ? (
          <>
            <DataTable
              columns={columns}
              data={filteredRows}
              pageSize={pageSize}
              initialPageIndex={currentPage - 1}
              minWidthClassName="min-w-[2000px]"
              emptyLabel={t("noCreativesForSelection")}
              toolbarLeft={
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchCreativesPlaceholder")} className="h-9 sm:w-80" />
              }
              toolbarActions={
                <>
                  <span className="text-xs text-white/45">{tCommon("countOfTotal", { filtered: formatNumber(filteredRows.length), total: formatNumber(rows.length) })}</span>
                  <FilterDropdown label={tCommon("type")} activeLabel={typeLabel}>
                    <FilterChip active={type === "all"} onClick={() => setType("all")}>{tCommon("allWithCount", { count: formatNumber(rows.length) })}</FilterChip>
                    <FilterChip active={type === "catalog"} onClick={() => setType("catalog")}>Catalog ({formatNumber(typeCounts.catalog ?? 0)})</FilterChip>
                    <FilterChip active={type === "post"} onClick={() => setType("post")}>Post ({formatNumber(typeCounts.post ?? 0)})</FilterChip>
                    <FilterChip active={type === "video"} onClick={() => setType("video")}>Video ({formatNumber(typeCounts.video ?? 0)})</FilterChip>
                    <FilterChip active={type === "image"} onClick={() => setType("image")}>Image ({formatNumber(typeCounts.image ?? 0)})</FilterChip>
                  </FilterDropdown>
                  <FilterDropdown label="Status" activeLabel={statusLabel}>
                    <FilterChip active={status === "ALL"} onClick={() => setStatus("ALL")}>{tCommon("all")}</FilterChip>
                    <FilterChip active={status === "ACTIVE"} onClick={() => setStatus("ACTIVE")}>Active</FilterChip>
                    <FilterChip active={status === "PAUSED"} onClick={() => setStatus("PAUSED")}>Paused</FilterChip>
                    <FilterChip active={status === "UNKNOWN"} onClick={() => setStatus("UNKNOWN")}>Unknown</FilterChip>
                  </FilterDropdown>
                  <FilterDropdown label="Funnel" activeLabel={funnelLabel}>
                    <FilterChip active={funnel === "ALL"} onClick={() => setFunnel("ALL")}>{tCommon("all")}</FilterChip>
                    <FilterChip active={funnel === "TOFU"} onClick={() => setFunnel("TOFU")}>TOFU ({formatNumber(funnelCounts.TOFU ?? 0)})</FilterChip>
                    <FilterChip active={funnel === "MOFU"} onClick={() => setFunnel("MOFU")}>MOFU ({formatNumber(funnelCounts.MOFU ?? 0)})</FilterChip>
                    <FilterChip active={funnel === "BOFU"} onClick={() => setFunnel("BOFU")}>BOFU ({formatNumber(funnelCounts.BOFU ?? 0)})</FilterChip>
                  </FilterDropdown>
                  <FilterDropdown label={tCommon("sortBy")} activeLabel={sortLabels[sort]}>
                    <FilterChip active={sort === "spend"} onClick={() => setSort("spend")}>Spend</FilterChip>
                    <FilterChip active={sort === "score"} onClick={() => setSort("score")}>Score</FilterChip>
                    <FilterChip active={sort === "roas"} onClick={() => setSort("roas")}>ROAS</FilterChip>
                    <FilterChip active={sort === "ctr"} onClick={() => setSort("ctr")}>CTR</FilterChip>
                    <FilterChip active={sort === "purchases"} onClick={() => setSort("purchases")}>Conversions</FilterChip>
                    <FilterChip active={sort === "cpa"} onClick={() => setSort("cpa")}>CPA</FilterChip>
                    <FilterChip active={sort === "hookRate"} onClick={() => setSort("hookRate")}>Hook</FilterChip>
                    <FilterChip active={sort === "outboundCvr"} onClick={() => setSort("outboundCvr")}>Outbound CVR</FilterChip>
                  </FilterDropdown>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="border-herb-border">
                        {hasAdvancedFilters ? t("valuesActive") : t("values")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[min(92vw,360px)] border-herb-border bg-herb-surface p-4 text-white">
                      <DropdownMenuLabel className="p-0">{t("minimumValues")}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <div className="grid gap-2">
                        <label className="grid gap-1 text-xs text-white/55">Min. Score<Input value={minScore} onChange={(event) => setMinScore(event.target.value)} inputMode="decimal" placeholder="70" className="h-9" /></label>
                        <label className="grid gap-1 text-xs text-white/55">Min. Spend<Input value={minSpend} onChange={(event) => setMinSpend(event.target.value)} inputMode="decimal" placeholder="0" className="h-9" /></label>
                        <label className="grid gap-1 text-xs text-white/55">Min. ROAS<Input value={minRoas} onChange={(event) => setMinRoas(event.target.value)} inputMode="decimal" placeholder="1.5" className="h-9" /></label>
                        <label className="grid gap-1 text-xs text-white/55">Min. CTR<Input value={minCtr} onChange={(event) => setMinCtr(event.target.value)} inputMode="decimal" placeholder="1.0" className="h-9" /></label>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {hasFilters ? <Button type="button" variant="outline" size="sm" className="border-herb-border" onClick={resetFilters}>Reset</Button> : null}
                </>
              }
            />
          </>
        ) : (
          <DataTable columns={sampleColumns} data={creativeRows} pageSize={pageSize} initialPageIndex={currentPage - 1} emptyLabel={t("noSampleCreatives")} />
        )}
      </CardContent>
    </Card>
  );
}
