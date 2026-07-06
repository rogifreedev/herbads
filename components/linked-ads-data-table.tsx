"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { DataTable } from "@/components/ui/data-table";
import type { CreativeDetail } from "@/lib/creatives";

type LinkedAd = CreativeDetail["ads"][number];

const columns: ColumnDef<LinkedAd>[] = [
  { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Ad" />, cell: ({ row }) => <span className="text-white">{row.original.name}</span>, meta: { label: "Ad" } },
  { accessorKey: "effectiveStatus", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <span className="text-white/65">{row.original.effectiveStatus}</span>, meta: { label: "Status" } },
  { accessorKey: "metaAdId", header: ({ column }) => <DataTableColumnHeader column={column} title="Meta ID" />, cell: ({ row }) => <span className="font-mono text-xs text-white/45">{row.original.metaAdId}</span>, meta: { label: "Meta ID" } }
];

export function LinkedAdsDataTable({ ads }: { ads: LinkedAd[] }) {
  const t = useTranslations("creatives");
  return <DataTable columns={columns} data={ads} pageSize={10} emptyLabel={t("noLinkedAds")} />;
}
