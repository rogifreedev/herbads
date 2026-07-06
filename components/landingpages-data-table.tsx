"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { formatCurrency, formatDate, formatDecimal, formatNumber } from "@/lib/format";
import type { Translator } from "@/lib/i18n-types";
import type { LandingpageListItem, LandingpageSignal } from "@/lib/landingpages";

type LandingpagesDataTableProps = {
  clientId: string;
  landingpages: LandingpageListItem[];
  emptyLabel: string;
};

function formatMatch(value: number | null) {
  return value === null ? "–" : `${Math.round(value)}/100`;
}

function matchSourceLabel(value: LandingpageListItem["matchSource"], t: Translator) {
  if (value === "landingpage") return "LP Match";
  if (value === "creative_ai") return "Creative AI Proxy";
  return t("notAnalyzed");
}

function AnalysisStatus({ landingpage }: { landingpage: LandingpageListItem }) {
  const t = useTranslations("landingpages");
  const analysis = landingpage.landingpageAnalysis;
  if (!analysis) return <Badge variant="secondary">{t("notCrawled")}</Badge>;
  if (analysis.status === "completed") {
    return (
      <div className="space-y-1">
        <Badge variant="success">{t("analyzed")}</Badge>
        <p className="text-xs text-white/45">{formatDate(analysis.analyzedAt)}</p>
      </div>
    );
  }
  if (analysis.status === "failed") return <Badge variant="destructive">{t("failed")}</Badge>;
  return <Badge variant="warning">{analysis.status}</Badge>;
}

function SignalBadge({ signal }: { signal: LandingpageSignal }) {
  if (signal === "GOOD") return <Badge variant="success">GOOD</Badge>;
  if (signal === "BLEED") return <Badge variant="destructive">BLEED</Badge>;
  return <Badge variant="warning">WATCH</Badge>;
}

function columns(clientId: string, t: Translator): ColumnDef<LandingpageListItem>[] {
  return [
    {
      accessorKey: "displayUrl",
      header: ({ column }) => <DataTableColumnHeader column={column} title="URL" />,
      cell: ({ row }) => (
        <Link href={row.original.url} target="_blank" className="flex max-w-[420px] items-center gap-2 truncate text-white hover:text-primary">
          <span className="truncate">{row.original.displayUrl}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/35" />
        </Link>
      ),
      meta: { label: "URL" }
    },
    {
      accessorKey: "adCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("adCountLabel")} />,
      cell: ({ row }) => <span className="text-white">{formatNumber(row.original.adCount)}</span>,
      meta: { label: t("adCountLabel") }
    },
    {
      id: "spend",
      accessorFn: (landingpage) => landingpage.metrics.spend,
      header: ({ column }) => <DataTableColumnHeader column={column} title="SPENT" />,
      cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.metrics.spend)}</span>,
      meta: { label: "SPENT" }
    },
    {
      id: "roas",
      accessorFn: (landingpage) => landingpage.metrics.roas ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ROAS" />,
      cell: ({ row }) => <span className="text-white">{formatDecimal(row.original.metrics.roas)}</span>,
      meta: { label: "ROAS" }
    },
    {
      id: "analysis",
      header: t("analysisColumn"),
      cell: ({ row }) => <AnalysisStatus landingpage={row.original} />,
      enableSorting: false,
      meta: { label: t("analysisColumn") }
    },
    {
      id: "match",
      accessorFn: (landingpage) => landingpage.matchScore ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Match" />,
      cell: ({ row }) => (
        <div className="text-white">
          <p>{formatMatch(row.original.matchScore)}</p>
          <p className="mt-1 text-xs text-white/40">{matchSourceLabel(row.original.matchSource, t)}</p>
        </div>
      ),
      meta: { label: "Match" }
    },
    {
      id: "bestAd",
      accessorFn: (landingpage) => landingpage.bestAd?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Best AD" />,
      cell: ({ row }) => row.original.bestAd ? <Link href={`/clients/${clientId}/creatives/${row.original.bestAd.creativeId}`} className="block max-w-[300px] truncate text-white hover:text-primary">{row.original.bestAd.name}</Link> : <span className="text-white/45">–</span>,
      meta: { label: "Best AD" }
    },
    {
      accessorKey: "signal",
      header: ({ column }) => <DataTableColumnHeader column={column} title="SIGNAL" />,
      cell: ({ row }) => <SignalBadge signal={row.original.signal} />,
      meta: { label: "SIGNAL" }
    }
  ];
}

export function LandingpagesDataTable({ clientId, landingpages, emptyLabel }: LandingpagesDataTableProps) {
  const t = useTranslations("landingpages");
  const tableColumns = useMemo(() => columns(clientId, t), [clientId, t]);
  return <DataTable columns={tableColumns} data={landingpages} pageSize={12} minWidthClassName="min-w-[1320px]" emptyLabel={emptyLabel} />;
}
