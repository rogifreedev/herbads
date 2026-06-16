"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import type { CompetitorCreative } from "@/lib/competitors";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

type Props = {
  clientId: string;
  creatives: CompetitorCreative[];
};

function sourceLabel(creative: CompetitorCreative) {
  return creative.demographicSignals.source === "meta_eu_transparency" ? "EU Transparency" : "Public";
}

function targetLocations(creative: CompetitorCreative) {
  const signals = creative.demographicSignals;
  if (signals.source === "meta_eu_transparency" && Array.isArray(signals.targetLocations)) {
    return signals.targetLocations
      .map((item) => {
        if (!item || typeof item !== "object" || !("location" in item)) return null;
        return typeof item.location === "string" ? item.location : null;
      })
      .filter(Boolean)
      .join(", ");
  }
  return creative.audienceLocations.join(", ");
}

function targetAge(creative: CompetitorCreative) {
  const value = creative.demographicSignals.targetAgeRange;
  if (typeof value === "string" && value) return value;
  return creative.ageRanges[0] ?? "–";
}

function targetGender(creative: CompetitorCreative) {
  const value = creative.demographicSignals.targetGender;
  if (typeof value === "string" && value) return value;
  return creative.genderSignals.includes("all") ? "All" : creative.genderSignals.slice(0, 2).join(", ") || "–";
}

function columns(clientId: string): ColumnDef<CompetitorCreative>[] {
  return [
    {
      accessorKey: "hook",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creative" />,
      cell: ({ row }) => {
        const creative = row.original;
        return (
          <div className="max-w-[360px]">
            <Link href={`/clients/${clientId}/competitors/creatives/${creative.id}`} className="font-medium text-white hover:text-primary">
              {creative.analysis?.hook ?? creative.hook ?? creative.headline ?? "Ohne Hook"}
            </Link>
            <p className="mt-1 line-clamp-2 text-xs text-white/50">{creative.primaryText ?? creative.headline ?? creative.adLibraryId}</p>
          </div>
        );
      },
      meta: { label: "Creative" }
    },
    {
      accessorKey: "format",
      header: "Format",
      cell: ({ row }) => <Badge variant="secondary">{row.original.format}</Badge>,
      meta: { label: "Format" }
    },
    {
      id: "status",
      accessorFn: (creative) => creative.status,
      header: "Status",
      cell: ({ row }) => <Badge variant={row.original.status === "active" ? "success" : "outline"}>{row.original.status}</Badge>,
      meta: { label: "Status" }
    },
    {
      id: "reach",
      accessorFn: (creative) => creative.reachEstimate ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reach" />,
      cell: ({ row }) => <span className="text-white">{row.original.reachEstimate ? formatNumber(row.original.reachEstimate) : "–"}</span>,
      meta: { label: "Reach" }
    },
    {
      id: "spend",
      accessorFn: (creative) => creative.estimatedSpend ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Est. Spend" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.estimatedSpend ?? 0)}</span>,
      meta: { label: "Est. Spend" }
    },
    {
      id: "dailySpend",
      accessorFn: (creative) => creative.estimatedDailySpend ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Daily" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.estimatedDailySpend ?? 0)}</span>,
      meta: { label: "Daily" }
    },
    {
      id: "activeDays",
      accessorFn: (creative) => creative.activeDays ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tage" />,
      cell: ({ row }) => <span className="text-white">{row.original.activeDays ? formatNumber(row.original.activeDays) : "–"}</span>,
      meta: { label: "Tage" }
    },
    {
      accessorKey: "startedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Start" />,
      cell: ({ row }) => <span className="text-white">{formatDate(row.original.startedAt)}</span>,
      meta: { label: "Start" }
    },
    {
      id: "target",
      accessorFn: targetLocations,
      header: "Target",
      cell: ({ row }) => <span className="text-white">{targetLocations(row.original) || "–"}</span>,
      meta: { label: "Target" }
    },
    {
      id: "age",
      accessorFn: targetAge,
      header: "Age",
      cell: ({ row }) => <span className="text-white">{targetAge(row.original)}</span>,
      meta: { label: "Age" }
    },
    {
      id: "gender",
      accessorFn: targetGender,
      header: "Gender",
      cell: ({ row }) => <span className="text-white">{targetGender(row.original)}</span>,
      meta: { label: "Gender" }
    },
    {
      id: "source",
      accessorFn: sourceLabel,
      header: "Quelle",
      cell: ({ row }) => <Badge variant="outline">{sourceLabel(row.original)}</Badge>,
      meta: { label: "Quelle" }
    },
    {
      id: "analysis",
      accessorFn: (creative) => creative.analysis?.rankingScore ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Analyse" />,
      cell: ({ row }) => row.original.analysis ? <Badge variant="success">Analysiert</Badge> : <Badge variant="secondary">Offen</Badge>,
      meta: { label: "Analyse" }
    }
  ];
}

export function CompetitorCreativesTable({ clientId, creatives }: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return creatives.filter((creative) => {
      if (!normalizedQuery) return true;
      return [
        creative.hook,
        creative.headline,
        creative.primaryText,
        creative.adLibraryId,
        creative.format,
        creative.status,
        creative.analysis?.angle,
        creative.analysis?.offer
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [creatives, normalizedQuery]);

  return (
    <DataTable
      columns={columns(clientId)}
      data={filtered}
      pageSize={10}
      minWidthClassName="min-w-[1450px]"
      emptyLabel="Keine Competitor Creatives fuer diese Auswahl."
      toolbarLeft={<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Hook, Copy, Ad Library ID" className="h-9 sm:w-80" />}
      toolbarActions={<span className="text-xs text-white/45">{formatNumber(filtered.length)} von {formatNumber(creatives.length)}</span>}
    />
  );
}
