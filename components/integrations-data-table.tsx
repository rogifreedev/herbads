"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { DataTable } from "@/components/ui/data-table";

export type IntegrationStatusRow = {
  label: string;
  key: string;
  configured: boolean;
};

const columns: ColumnDef<IntegrationStatusRow>[] = [
  { accessorKey: "label", header: ({ column }) => <DataTableColumnHeader column={column} title="Integration" />, cell: ({ row }) => <span className="text-white">{row.original.label}</span>, meta: { label: "Integration" } },
  { accessorKey: "key", header: ({ column }) => <DataTableColumnHeader column={column} title="Env Key" />, cell: ({ row }) => <span className="font-mono text-xs text-white/45">{row.original.key}</span>, meta: { label: "Env Key" } },
  {
    accessorKey: "configured",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <span className={row.original.configured ? "rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-100" : "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100"}>
        {row.original.configured ? "konfiguriert" : "fehlt"}
      </span>
    ),
    meta: { label: "Status" }
  }
];

export function IntegrationsDataTable({ integrations }: { integrations: IntegrationStatusRow[] }) {
  return <DataTable columns={columns} data={integrations} pageSize={20} emptyLabel="Keine Integrationen definiert." />;
}
