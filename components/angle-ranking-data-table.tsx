"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import type { AngleInsight, CreativeAngleItem } from "@/lib/creative-angles";
import { formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/format";

type AngleRankingDataTableProps = {
  clientId: string;
  angles: AngleInsight[];
};

type CreativeAnglesDataTableProps = {
  clientId: string;
  creatives: CreativeAngleItem[];
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
    ...angle.exampleCreatives.flatMap((creative) => [creative.name, String(creative.score)])
  ].join(" ").toLowerCase();
}

function creativeSearchText(creative: CreativeAngleItem) {
  return [
    creative.creativeName,
    creative.angle,
    creative.reason,
    creative.type,
    creative.status,
    creative.funnelStage,
    creative.hook,
    creative.primaryText,
    creative.headline
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
      accessorKey: "creativeCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creatives" />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.creativeCount)}</span>,
      meta: { label: "Creatives" }
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
                <p className="mb-1 uppercase tracking-[0.14em] text-white/35">Beispiele</p>
                <div className="space-y-1">
                  {angle.exampleCreatives.map((creative) => (
                    <Link key={creative.id} href={`/clients/${clientId}/creatives/${creative.id}`} className="flex items-center justify-between gap-2 text-primary hover:text-white">
                      <span className="truncate">{creative.name}</span>
                      <span className="shrink-0 text-white/40">{creative.score}</span>
                    </Link>
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

function creativeColumns(clientId: string): ColumnDef<CreativeAngleItem>[] {
  return [
    {
      accessorKey: "creativeName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Anzeige" />,
      cell: ({ row }) => {
        const creative = row.original;
        return (
          <div className="min-w-[220px] space-y-2">
            <Link href={`/clients/${clientId}/creatives/${creative.creativeId}`} className="font-medium text-primary hover:text-white">{creative.creativeName}</Link>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{creative.type}</Badge>
              <Badge variant={creative.status === "ACTIVE" ? "success" : "secondary"}>{creative.status}</Badge>
              {creative.funnelStage ? <Badge variant="secondary">{creative.funnelStage}</Badge> : null}
            </div>
          </div>
        );
      },
      meta: { label: "Anzeige" }
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
      accessorKey: "hook",
      header: "Hook",
      cell: ({ row }) => <span className="block max-w-[260px] text-xs text-white/65">{truncate(row.original.hook, 110)}</span>,
      meta: { label: "Hook" }
    },
    {
      id: "primaryText",
      accessorFn: (creative) => creative.primaryText ?? creative.headline ?? "",
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
      accessorFn: (creative) => creative.roas ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ROAS" />,
      cell: ({ row }) => <span className="text-white">{formatDecimal(row.original.roas)}</span>,
      meta: { label: "ROAS" }
    },
    {
      id: "ctr",
      accessorFn: (creative) => creative.ctr ?? -1,
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
      toolbarLeft={<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Angle, Hook, Beispiel-Creative" className="h-9 sm:w-96" />}
      toolbarActions={
        <>
          <span className="text-xs text-white/45">{formatNumber(filteredRows.length)} von {formatNumber(angles.length)}</span>
          {query ? <Button type="button" variant="outline" size="sm" className="border-herb-border" onClick={() => setQuery("")}>Reset</Button> : null}
        </>
      }
    />
  );
}

export function CreativeAnglesDataTable({ clientId, creatives }: CreativeAnglesDataTableProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return creatives
      .filter((creative) => !normalizedQuery || creativeSearchText(creative).includes(normalizedQuery))
      .sort((a, b) => b.score - a.score || b.spend - a.spend);
  }, [creatives, normalizedQuery]);

  return (
    <DataTable
      columns={creativeColumns(clientId)}
      data={filteredRows}
      pageSize={12}
      minWidthClassName="min-w-[1680px]"
      emptyLabel="Keine Anzeigen fuer die aktuelle Suche."
      toolbarLeft={<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Anzeige, Angle, Hook oder Primary Text" className="h-9 sm:w-96" />}
      toolbarActions={
        <>
          <span className="text-xs text-white/45">{formatNumber(filteredRows.length)} von {formatNumber(creatives.length)}</span>
          {query ? <Button type="button" variant="outline" size="sm" className="border-herb-border" onClick={() => setQuery("")}>Reset</Button> : null}
        </>
      }
    />
  );
}
