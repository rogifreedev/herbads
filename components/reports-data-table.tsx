"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { formatCurrency, formatNumber } from "@/lib/format";

export type ReportTableRow = {
  clientId: string;
  clientName: string;
  creatives: number;
  analyzed: number;
  avgScore: number | null;
  totalSpend: number;
  purchases: number;
  topCreativeName: string | null;
};

export function ReportsDataTable({ reports }: { reports: ReportTableRow[] }) {
  const t = useTranslations("reports");
  const tCommon = useTranslations("common");
  const columns = useMemo<ColumnDef<ReportTableRow>[]>(() => [
    { accessorKey: "clientName", header: ({ column }) => <DataTableColumnHeader column={column} title={t("clientColumn")} />, cell: ({ row }) => <span className="text-white">{row.original.clientName}</span>, meta: { label: t("clientColumn") } },
    { accessorKey: "creatives", header: ({ column }) => <DataTableColumnHeader column={column} title="Creatives" />, cell: ({ row }) => <span className="text-white">{formatNumber(row.original.creatives)}</span>, meta: { label: "Creatives" } },
    { accessorKey: "analyzed", header: ({ column }) => <DataTableColumnHeader column={column} title={tCommon("aiAnalyzed")} />, cell: ({ row }) => <span className="text-white">{formatNumber(row.original.analyzed)}</span>, meta: { label: tCommon("aiAnalyzed") } },
    { accessorKey: "avgScore", header: ({ column }) => <DataTableColumnHeader column={column} title="Avg. Score" />, cell: ({ row }) => <span className="text-primary">{row.original.avgScore === null ? "–" : `${row.original.avgScore}/100`}</span>, meta: { label: "Avg. Score" } },
    { accessorKey: "totalSpend", header: ({ column }) => <DataTableColumnHeader column={column} title="Spend" />, cell: ({ row }) => <span className="text-white">{formatCurrency(row.original.totalSpend)}</span>, meta: { label: "Spend" } },
    { accessorKey: "purchases", header: ({ column }) => <DataTableColumnHeader column={column} title="Conversions" />, cell: ({ row }) => <span className="text-white">{formatNumber(row.original.purchases)}</span>, meta: { label: "Conversions" } },
    { accessorKey: "topCreativeName", header: ({ column }) => <DataTableColumnHeader column={column} title="Top Creative" />, cell: ({ row }) => <span className="text-white/70">{row.original.topCreativeName ?? "–"}</span>, meta: { label: "Top Creative" } },
    {
      id: "actions",
      header: t("action"),
      cell: ({ row }) => (
        <Button asChild size="sm" variant="outline" className="border-herb-border">
          <Link href={`/clients/${row.original.clientId}/creatives?sort=score`}>{t("viewReport")}</Link>
        </Button>
      ),
      enableSorting: false,
      enableHiding: false
    }
  ], [t, tCommon]);

  return <DataTable columns={columns} data={reports} pageSize={10} minWidthClassName="min-w-[900px]" emptyLabel={t("noClientsYet")} />;
}
