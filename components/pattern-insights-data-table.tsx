"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { DataTable } from "@/components/ui/data-table";
import { formatPercent } from "@/lib/format";
import type { PatternInsight } from "@/lib/pattern-analysis";

const columns: ColumnDef<PatternInsight>[] = [
  {
    accessorKey: "label",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pattern" />,
    cell: ({ row }) => <span className="text-white">{row.original.label}</span>,
    meta: { label: "Pattern" }
  },
  {
    id: "topShare",
    accessorFn: (insight) => insight.topShare,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Top Share" />,
    cell: ({ row }) => <span className="text-white">{formatPercent(row.original.topShare * 100)}</span>,
    meta: { label: "Top Share" }
  },
  {
    id: "lowShare",
    accessorFn: (insight) => insight.lowShare,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Low Share" />,
    cell: ({ row }) => <span className="text-white/65">{formatPercent(row.original.lowShare * 100)}</span>,
    meta: { label: "Low Share" }
  },
  {
    id: "lift",
    accessorFn: (insight) => insight.lift,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Lift" />,
    cell: ({ row }) => <span className="text-primary">+{formatPercent(row.original.lift * 100)}</span>,
    meta: { label: "Lift" }
  }
];

export function PatternInsightsDataTable({ insights }: { insights: PatternInsight[] }) {
  return <DataTable columns={columns} data={insights} pageSize={10} emptyLabel="Noch keine stabilen Patterns gefunden. Es braucht mehrere Creatives mit Spend und idealerweise gespeicherte AI-Analysen." />;
}
