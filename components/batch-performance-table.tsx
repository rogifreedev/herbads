"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import type { BatchPerformanceItem } from "@/lib/batch-performance";
import type { Translator } from "@/lib/i18n-types";

type SortKey = "score" | "spend" | "roas" | "ctr" | "purchases" | "cpa" | "hookRate" | "outboundCvr";

function numericInput(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNullableCurrency(value: number | null) {
  return value === null ? "â€“" : formatCurrency(value, 2);
}

function batchStatusLabel(status: BatchPerformanceItem["status"], t: Translator) {
  return status === "live" ? t("statusLive") : t("statusFound");
}

function statusVariant(status: BatchPerformanceItem["status"]) {
  return status === "live" ? "success" : "warning";
}

function sortValue(batch: BatchPerformanceItem, sort: SortKey) {
  if (sort === "score") return batch.performanceScore.score;
  if (sort === "roas") return batch.metrics.roas ?? -1;
  if (sort === "ctr") return batch.metrics.ctr ?? -1;
  if (sort === "purchases") return batch.metrics.purchases;
  if (sort === "cpa") return batch.metrics.costPerPurchase === null ? Number.NEGATIVE_INFINITY : -batch.metrics.costPerPurchase;
  if (sort === "hookRate") return batch.metrics.hookRate ?? -1;
  if (sort === "outboundCvr") return batch.metrics.outboundCvr ?? -1;
  return batch.metrics.spend;
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

function realColumns(t: Translator, tCreatives: Translator): ColumnDef<BatchPerformanceItem>[] {
  return [
    {
      accessorKey: "batchName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Batch" />,
      cell: ({ row }) => {
        const batch = row.original;
        return (
          <div className="min-w-[280px]">
            <p className="line-clamp-2 font-medium text-white">{batch.batchName}</p>
            <p className="mt-1 text-xs text-white/45">{batch.sourceFolderLabel ?? t("driveFolderFallback")}</p>
            {batch.path !== batch.batchName ? <p className="mt-1 line-clamp-1 text-xs text-white/35">{batch.path}</p> : null}
          </div>
        );
      },
      meta: { label: "Batch" }
    },
    {
      id: "match",
      accessorFn: (batch) => batch.match.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Meta Match" />,
      cell: ({ row }) => {
        const batch = row.original;
        const label = batch.match.name;
        return (
          <div className="min-w-[300px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Ad Set</Badge>
              <Badge variant={statusVariant(batch.status)}>{batchStatusLabel(batch.status, t)}</Badge>
            </div>
            {batch.match.href ? (
              <Link href={batch.match.href} className="mt-2 block line-clamp-2 font-medium text-primary hover:text-white">
                {label}
              </Link>
            ) : (
              <p className="mt-2 line-clamp-2 font-medium text-white">{label}</p>
            )}
            <p className="mt-1 text-xs text-white/40">{t("metaStatusLine", { status: batch.match.effectiveStatus ?? batch.match.status ?? "-" })}</p>
          </div>
        );
      },
      meta: { label: "Meta Match" }
    },
    {
      id: "score",
      accessorFn: (batch) => batch.performanceScore.score,
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
      id: "ads",
      accessorFn: (batch) => batch.adCount,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ads" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.adCount)}</span>,
      meta: { label: "Ads" }
    },
    {
      id: "creatives",
      accessorFn: (batch) => batch.creativeCount,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creatives" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.creativeCount)}</span>,
      meta: { label: "Creatives" }
    },
    {
      accessorKey: "firstActiveDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title={tCreatives("firstActive")} />,
      cell: ({ row }) => <span className="text-white">{formatDate(row.original.firstActiveDate)}</span>,
      meta: { label: tCreatives("firstActive") }
    },
    {
      id: "spend",
      accessorFn: (batch) => batch.metrics.spend,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Spend" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.metrics.spend)}</span>,
      meta: { label: "Spend" }
    },
    {
      id: "cpc",
      accessorFn: (batch) => batch.metrics.cpc ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CPC" />,
      cell: ({ row }) => <span className="text-white">{formatNullableCurrency(row.original.metrics.cpc)}</span>,
      meta: { label: "CPC" }
    },
    {
      id: "cpm",
      accessorFn: (batch) => batch.metrics.cpm ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CPM" />,
      cell: ({ row }) => <span className="text-white">{formatNullableCurrency(row.original.metrics.cpm)}</span>,
      meta: { label: "CPM" }
    },
    {
      id: "reach",
      accessorFn: (batch) => batch.metrics.reach,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reach" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.metrics.reach)}</span>,
      meta: { label: "Reach" }
    },
    {
      id: "impressions",
      accessorFn: (batch) => batch.metrics.impressions,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Impr." />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.metrics.impressions)}</span>,
      meta: { label: "Impr." }
    },
    {
      id: "purchases",
      accessorFn: (batch) => batch.metrics.purchases,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Conversions" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.metrics.purchases)}</span>,
      meta: { label: "Conversions" }
    },
    {
      id: "purchaseValue",
      accessorFn: (batch) => batch.metrics.purchaseValue,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Conv. Value" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.metrics.purchaseValue)}</span>,
      meta: { label: "Conv. Value" }
    },
    {
      id: "cpa",
      accessorFn: (batch) => batch.metrics.costPerPurchase ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CPA" />,
      cell: ({ row }) => <span className="text-white">{formatNullableCurrency(row.original.metrics.costPerPurchase)}</span>,
      meta: { label: "CPA" }
    },
    {
      id: "ctr",
      accessorFn: (batch) => batch.metrics.ctr ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CTR" />,
      cell: ({ row }) => <span className="text-primary">{formatPercent(row.original.metrics.ctr)}</span>,
      meta: { label: "CTR" }
    },
    {
      id: "hookRate",
      accessorFn: (batch) => batch.metrics.hookRate ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hook" />,
      cell: ({ row }) => <span className="text-white">{formatPercent(row.original.metrics.hookRate)}</span>,
      meta: { label: "Hook" }
    },
    {
      id: "holdRate",
      accessorFn: (batch) => batch.metrics.holdRate ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hold" />,
      cell: ({ row }) => <span className="text-white">{formatPercent(row.original.metrics.holdRate)}</span>,
      meta: { label: "Hold" }
    },
    {
      id: "outboundCvr",
      accessorFn: (batch) => batch.metrics.outboundCvr ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Outbound CVR" />,
      cell: ({ row }) => <span className="text-primary">{formatPercent(row.original.metrics.outboundCvr)}</span>,
      meta: { label: "Outbound CVR" }
    },
    {
      id: "roas",
      accessorFn: (batch) => batch.metrics.roas ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ROAS" />,
      cell: ({ row }) => <span className="text-white">{formatDecimal(row.original.metrics.roas)}</span>,
      meta: { label: "ROAS" }
    },
    {
      accessorKey: "checkedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("checkedColumn")} />,
      cell: ({ row }) => <span className="text-white/65">{formatDate(row.original.checkedAt)}</span>,
      meta: { label: t("checkedColumn") }
    },
    {
      id: "drive",
      header: "Drive",
      cell: ({ row }) => row.original.driveHref ? (
        <Link href={row.original.driveHref} target="_blank" className="inline-flex items-center gap-2 text-primary hover:text-white">
          <ExternalLink className="h-4 w-4" />
          {t("folderLink")}
        </Link>
      ) : <span className="text-white/45">-</span>,
      meta: { label: "Drive" }
    }
  ];
}

export function BatchPerformanceTable({ batches, pageSize = 12 }: { batches: BatchPerformanceItem[]; pageSize?: number }) {
  const t = useTranslations("batches");
  const tCommon = useTranslations("common");
  const tCreatives = useTranslations("creatives");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | "live" | "found">("ALL");
  const [sort, setSort] = useState<SortKey>("spend");
  const [minSpend, setMinSpend] = useState("");
  const [minRoas, setMinRoas] = useState("");
  const [minCtr, setMinCtr] = useState("");
  const rows = useMemo(() => batches, [batches]);
  const normalizedQuery = query.trim().toLowerCase();
  const minSpendValue = numericInput(minSpend);
  const minRoasValue = numericInput(minRoas);
  const minCtrValue = numericInput(minCtr);
  const statusCounts = useMemo(() => rows.reduce<Record<string, number>>((counts, batch) => {
    counts[batch.status] = (counts[batch.status] ?? 0) + 1;
    return counts;
  }, {}), [rows]);
  const filteredRows = useMemo(() => rows
    .filter((batch) => status === "ALL" || batch.status === status)
    .filter((batch) => minSpendValue === null || batch.metrics.spend >= minSpendValue)
    .filter((batch) => minRoasValue === null || (batch.metrics.roas ?? -1) >= minRoasValue)
    .filter((batch) => minCtrValue === null || (batch.metrics.ctr ?? -1) >= minCtrValue)
    .filter((batch) => {
      if (!normalizedQuery) return true;
      return [batch.batchName, batch.path, batch.sourceFolderLabel, batch.match.name, batch.match.status, batch.match.effectiveStatus, batch.match.type].some((value) => value?.toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => sortValue(right, sort) - sortValue(left, sort) || left.batchName.localeCompare(right.batchName, locale)), [locale, minCtrValue, minRoasValue, minSpendValue, normalizedQuery, rows, sort, status]);
  const columns = useMemo(() => realColumns(t, tCreatives), [t, tCreatives]);
  const hasAdvancedFilters = minSpend || minRoas || minCtr;
  const hasFilters = query || status !== "ALL" || sort !== "spend" || hasAdvancedFilters;
  const statusLabel = status === "ALL" ? tCommon("all") : batchStatusLabel(status, t);
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
    setStatus("ALL");
    setSort("spend");
    setMinSpend("");
    setMinRoas("");
    setMinCtr("");
  }

  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardHeader>
        <CardTitle>Batch Ranking</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={filteredRows}
          pageSize={pageSize}
          minWidthClassName="min-w-[2200px]"
          emptyLabel={rows.length === 0 ? t("emptyNoBatches") : t("emptyFiltered")}
          toolbarLeft={
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="h-9 sm:w-80" />
          }
          toolbarActions={
            <>
              <span className="text-xs text-white/45">{tCommon("countOfTotal", { filtered: formatNumber(filteredRows.length), total: formatNumber(rows.length) })}</span>
              <FilterDropdown label={tCommon("status")} activeLabel={statusLabel}>
                <FilterChip active={status === "ALL"} onClick={() => setStatus("ALL")}>{tCommon("allWithCount", { count: formatNumber(rows.length) })}</FilterChip>
                <FilterChip active={status === "live"} onClick={() => setStatus("live")}>{t("statusLive")} ({formatNumber(statusCounts.live ?? 0)})</FilterChip>
                <FilterChip active={status === "found"} onClick={() => setStatus("found")}>{t("statusFound")} ({formatNumber(statusCounts.found ?? 0)})</FilterChip>
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
                    {hasAdvancedFilters ? tCreatives("valuesActive") : tCreatives("values")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[min(92vw,360px)] border-herb-border bg-herb-surface p-4 text-white">
                  <DropdownMenuLabel className="p-0">{tCreatives("minimumValues")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="grid gap-2">
                    <label className="grid gap-1 text-xs text-white/55">Min. Spend<Input value={minSpend} onChange={(event) => setMinSpend(event.target.value)} inputMode="decimal" placeholder="100" className="h-9" /></label>
                    <label className="grid gap-1 text-xs text-white/55">Min. ROAS<Input value={minRoas} onChange={(event) => setMinRoas(event.target.value)} inputMode="decimal" placeholder="1.5" className="h-9" /></label>
                    <label className="grid gap-1 text-xs text-white/55">Min. CTR<Input value={minCtr} onChange={(event) => setMinCtr(event.target.value)} inputMode="decimal" placeholder="1.0" className="h-9" /></label>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              {hasFilters ? <Button type="button" variant="outline" size="sm" className="border-herb-border" onClick={resetFilters}>Reset</Button> : null}
            </>
          }
        />
      </CardContent>
    </Card>
  );
}
