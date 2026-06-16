"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import type { AdsetAngleItem, AngleInsight } from "@/lib/creative-angles";
import { formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/format";

type AngleRankingDataTableProps = {
  clientId: string;
  angles: AngleInsight[];
};

type AdsetAnglesDataTableProps = {
  clientId: string;
  adsets: AdsetAngleItem[];
};

function scoreVariant(score: number): "success" | "warning" | "secondary" {
  if (score >= 70) return "success";
  if (score >= 45) return "warning";
  return "secondary";
}

function truncate(value: string | null, max: number) {
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max - 3).trim()}...` : value;
}

function Score({ value }: { value: number }) {
  return <span className="font-heading text-2xl text-primary">{value}</span>;
}

function angleSearchText(angle: AngleInsight) {
  return [
    angle.angle,
    angle.summary,
    ...angle.formats,
    ...angle.funnelStages,
    ...angle.topHooks,
    ...angle.exampleAdsets.flatMap((adset) => [adset.name, String(adset.score)]),
    ...angle.exampleCreatives.flatMap((creative) => [creative.name, String(creative.score)])
  ].join(" ").toLowerCase();
}

function adsetSearchText(adset: AdsetAngleItem) {
  return [
    adset.adsetName,
    adset.angle,
    adset.reason,
    adset.optimizationGoal,
    adset.status,
    ...adset.formats,
    ...adset.funnelStages,
    ...adset.creativeNames,
    adset.hook,
    adset.primaryText,
    adset.headline
  ].filter(Boolean).join(" ").toLowerCase();
}

function angleColumns(clientId: string): ColumnDef<AngleInsight>[] {
  return [
    {
      accessorKey: "angle",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Angle" />,
      cell: ({ row }) => {
        const angle = row.original;
        return (
          <div className="max-w-[420px] space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white">{angle.angle}</span>
              <Badge variant={scoreVariant(angle.score)}>Conf. {angle.avgConfidence}</Badge>
            </div>
            <p className="line-clamp-2 text-xs text-white/50">{angle.summary}</p>
          </div>
        );
      },
      meta: { label: "Angle" }
    },
    {
      accessorKey: "score",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Punkte" />,
      cell: ({ row }) => <Score value={row.original.score} />,
      meta: { label: "Punkte" }
    },
    {
      accessorKey: "adsetCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Adsets" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.adsetCount)}</span>,
      meta: { label: "Adsets" }
    },
    {
      accessorKey: "spend",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Spend" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.spend)}</span>,
      meta: { label: "Spend" }
    },
    {
      id: "roas",
      accessorFn: (angle) => angle.roas ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ROAS" />,
      cell: ({ row }) => <span className="text-white">{formatDecimal(row.original.roas)}</span>,
      meta: { label: "ROAS" }
    },
    {
      id: "ctr",
      accessorFn: (angle) => angle.ctr ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CTR" />,
      cell: ({ row }) => <span className="text-white">{formatPercent(row.original.ctr)}</span>,
      meta: { label: "CTR" }
    },
    {
      id: "hookRate",
      accessorFn: (angle) => angle.hookRate ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hook Rate" />,
      cell: ({ row }) => <span className="text-white">{formatPercent(row.original.hookRate)}</span>,
      meta: { label: "Hook Rate" }
    },
    {
      id: "formats",
      header: "Formate",
      cell: ({ row }) => (
        <div className="flex max-w-[220px] flex-wrap gap-1">
          {row.original.formats.map((format) => <Badge key={format} variant="outline">{format}</Badge>)}
          {row.original.funnelStages.map((stage) => <Badge key={stage} variant="secondary">{stage}</Badge>)}
        </div>
      ),
      meta: { label: "Formate" }
    },
    {
      id: "details",
      header: "Details",
      enableSorting: false,
      cell: ({ row }) => {
        const angle = row.original;
        return (
          <details className="min-w-[260px] rounded-lg border border-herb-border bg-black/20 p-2 text-xs text-white/60">
            <summary className="cursor-pointer select-none text-primary">Hooks & Beispiele</summary>
            <div className="mt-3 space-y-3">
              {angle.topHooks.length > 0 ? (
                <div>
                  <p className="mb-1 uppercase tracking-[0.14em] text-white/35">Top Hooks</p>
                  <div className="space-y-1">
                    {angle.topHooks.map((hook) => <p key={hook} className="line-clamp-2 rounded bg-white/[0.03] px-2 py-1">{hook}</p>)}
                  </div>
                </div>
              ) : null}
              <div>
                <p className="mb-1 uppercase tracking-[0.14em] text-white/35">Beispiel-Adsets</p>
                <div className="space-y-1">
                  {angle.exampleAdsets.map((adset) => (
                    <div key={adset.id} className="flex items-center justify-between gap-2 rounded bg-white/[0.03] px-2 py-1">
                      {adset.representativeCreativeId ? (
                        <Link href={`/clients/${clientId}/creatives/${adset.representativeCreativeId}`} className="truncate text-primary hover:text-white">{adset.name}</Link>
                      ) : (
                        <span className="truncate text-white/65">{adset.name}</span>
                      )}
                      <span className="shrink-0 text-white/40">{adset.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        );
      },
      meta: { label: "Details" }
    }
  ];
}

function adsetColumns(clientId: string): ColumnDef<AdsetAngleItem>[] {
  return [
    {
      accessorKey: "adsetName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Adset" />,
      cell: ({ row }) => {
        const adset = row.original;
        return (
          <div className="min-w-[260px] space-y-2">
            <p className="font-medium text-white">{adset.adsetName}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant={adset.status === "ACTIVE" ? "success" : "secondary"}>{adset.status}</Badge>
              {adset.optimizationGoal ? <Badge variant="outline">{adset.optimizationGoal}</Badge> : null}
              {adset.funnelStages.map((stage) => <Badge key={stage} variant="secondary">{stage}</Badge>)}
            </div>
            {adset.representativeCreativeId && adset.representativeCreativeName ? (
              <Link href={`/clients/${clientId}/creatives/${adset.representativeCreativeId}`} className="block truncate text-xs text-primary hover:text-white">
                Beispiel: {adset.representativeCreativeName}
              </Link>
            ) : null}
          </div>
        );
      },
      meta: { label: "Adset" }
    },
    {
      accessorKey: "angle",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Angle" />,
      cell: ({ row }) => <div className="max-w-[260px]"><p className="font-medium text-white">{row.original.angle}</p><p className="mt-1 line-clamp-2 text-xs text-white/45">{row.original.reason}</p></div>,
      meta: { label: "Angle" }
    },
    {
      accessorKey: "score",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Punkte" />,
      cell: ({ row }) => <Score value={row.original.score} />,
      meta: { label: "Punkte" }
    },
    {
      accessorKey: "confidence",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Confidence" />,
      cell: ({ row }) => <Badge variant={scoreVariant(row.original.score)}>Conf. {row.original.confidence}</Badge>,
      meta: { label: "Confidence" }
    },
    {
      accessorKey: "adCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ads" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.adCount)}</span>,
      meta: { label: "Ads" }
    },
    {
      accessorKey: "creativeCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creatives" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.creativeCount)}</span>,
      meta: { label: "Creatives" }
    },
    {
      accessorKey: "hook",
      header: "Hook",
      cell: ({ row }) => <span className="block max-w-[260px] text-xs text-white/65">{truncate(row.original.hook, 110)}</span>,
      meta: { label: "Hook" }
    },
    {
      id: "primaryText",
      accessorFn: (adset) => adset.primaryText ?? adset.headline ?? "",
      header: "Primary Text",
      cell: ({ row }) => <span className="block max-w-[320px] text-xs text-white/65">{truncate(row.original.primaryText ?? row.original.headline, 160)}</span>,
      meta: { label: "Primary Text" }
    },
    {
      accessorKey: "spend",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Spend" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.spend)}</span>,
      meta: { label: "Spend" }
    },
    {
      id: "roas",
      accessorFn: (adset) => adset.roas ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ROAS" />,
      cell: ({ row }) => <span className="text-white">{formatDecimal(row.original.roas)}</span>,
      meta: { label: "ROAS" }
    },
    {
      id: "ctr",
      accessorFn: (adset) => adset.ctr ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CTR" />,
      cell: ({ row }) => <span className="text-white">{formatPercent(row.original.ctr)}</span>,
      meta: { label: "CTR" }
    },
    {
      accessorKey: "purchases",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Conv." />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.purchases)}</span>,
      meta: { label: "Conversions" }
    },
    {
      accessorKey: "impressions",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Impr." />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.impressions)}</span>,
      meta: { label: "Impressions" }
    }
  ];
}

export function AngleRankingDataTable({ clientId, angles }: AngleRankingDataTableProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return angles
      .filter((angle) => !normalizedQuery || angleSearchText(angle).includes(normalizedQuery))
      .sort((a, b) => b.score - a.score || b.spend - a.spend);
  }, [angles, normalizedQuery]);

  return (
    <DataTable
      columns={angleColumns(clientId)}
      data={filteredRows}
      pageSize={10}
      minWidthClassName="min-w-[1420px]"
      emptyLabel="Keine Angles fuer die aktuelle Suche."
      toolbarLeft={<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Angle, Hook, Beispiel-Adset" className="h-9 sm:w-96" />}
      toolbarActions={
        <>
          <span className="text-xs text-white/45">{formatNumber(filteredRows.length)} von {formatNumber(angles.length)}</span>
          {query ? <Button type="button" variant="outline" size="sm" className="border-herb-border" onClick={() => setQuery("")}>Reset</Button> : null}
        </>
      }
    />
  );
}

export function AdsetAnglesDataTable({ clientId, adsets }: AdsetAnglesDataTableProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return adsets
      .filter((adset) => !normalizedQuery || adsetSearchText(adset).includes(normalizedQuery))
      .sort((a, b) => b.score - a.score || b.spend - a.spend);
  }, [adsets, normalizedQuery]);

  return (
    <DataTable
      columns={adsetColumns(clientId)}
      data={filteredRows}
      pageSize={12}
      minWidthClassName="min-w-[1680px]"
      emptyLabel="Keine Adsets fuer die aktuelle Suche."
      toolbarLeft={<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Adset, Angle, Hook oder Primary Text" className="h-9 sm:w-96" />}
      toolbarActions={
        <>
          <span className="text-xs text-white/45">{formatNumber(filteredRows.length)} von {formatNumber(adsets.length)}</span>
          {query ? <Button type="button" variant="outline" size="sm" className="border-herb-border" onClick={() => setQuery("")}>Reset</Button> : null}
        </>
      }
    />
  );
}
