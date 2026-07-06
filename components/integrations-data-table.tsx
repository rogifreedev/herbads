"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { DataTable } from "@/components/ui/data-table";

export type IntegrationStatusRow = {
  label: string;
  key: string;
  configured: boolean;
};

export function IntegrationsDataTable({ integrations }: { integrations: IntegrationStatusRow[] }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const columns = useMemo<ColumnDef<IntegrationStatusRow>[]>(() => [
    { accessorKey: "label", header: ({ column }) => <DataTableColumnHeader column={column} title={t("columnIntegration")} />, cell: ({ row }) => <span className="text-white">{row.original.label}</span>, meta: { label: t("columnIntegration") } },
    { accessorKey: "key", header: ({ column }) => <DataTableColumnHeader column={column} title={t("columnEnvKey")} />, cell: ({ row }) => <span className="font-mono text-xs text-white/45">{row.original.key}</span>, meta: { label: t("columnEnvKey") } },
    {
      accessorKey: "configured",
      header: ({ column }) => <DataTableColumnHeader column={column} title={tCommon("status")} />,
      cell: ({ row }) => (
        <span className={row.original.configured ? "rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-100" : "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100"}>
          {row.original.configured ? t("statusConfigured") : t("statusMissing")}
        </span>
      ),
      meta: { label: tCommon("status") }
    }
  ], [t, tCommon]);

  return <DataTable columns={columns} data={integrations} pageSize={20} emptyLabel={t("noIntegrations")} />;
}
