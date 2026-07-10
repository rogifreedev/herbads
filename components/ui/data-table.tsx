"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyLabel?: string;
  pageSize?: number;
  initialPageIndex?: number;
  minWidthClassName?: string;
  toolbarLeft?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  serverPagination?: {
    pageIndex: number;
    pageCount: number;
    rowCount: number;
    onPageChange: (pageIndex: number) => void;
  };
};

export function DataTable<TData, TValue>({ columns, data, emptyLabel, pageSize = 10, initialPageIndex = 0, minWidthClassName, toolbarLeft, toolbarActions, serverPagination }: DataTableProps<TData, TValue>) {
  const t = useTranslations("common");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: Boolean(serverPagination),
    pageCount: serverPagination?.pageCount,
    initialState: {
      pagination: {
        pageIndex: initialPageIndex,
        pageSize
      }
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      ...(serverPagination
        ? { pagination: { pageIndex: serverPagination.pageIndex, pageSize } }
        : {})
    }
  });

  React.useEffect(() => {
    if (!serverPagination) table.setPageIndex(0);
  }, [data, serverPagination, table]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">{toolbarLeft}</div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {toolbarActions}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-border">
                <Settings2 className="mr-2 h-4 w-4" />
                {t("columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-popover text-popover-foreground">
              <DropdownMenuLabel>{t("showColumns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}>
                    {(column.columnDef.meta as { label?: string } | undefined)?.label ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-sm)]">
        <Table className={cn(minWidthClassName)}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyLabel ?? t("noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{t("rowCount", { count: formatNumber(serverPagination?.rowCount ?? table.getFilteredRowModel().rows.length) })}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-border" onClick={() => serverPagination ? serverPagination.onPageChange(serverPagination.pageIndex - 1) : table.previousPage()} disabled={serverPagination ? serverPagination.pageIndex <= 0 : !table.getCanPreviousPage()}>
            {t("back")}
          </Button>
          <span className="min-w-24 text-center">
            {t("pageOf", { page: serverPagination ? serverPagination.pageIndex + 1 : table.getState().pagination.pageIndex + 1, total: Math.max(1, serverPagination?.pageCount ?? table.getPageCount()) })}
          </span>
          <Button variant="outline" size="sm" className="border-border" onClick={() => serverPagination ? serverPagination.onPageChange(serverPagination.pageIndex + 1) : table.nextPage()} disabled={serverPagination ? serverPagination.pageIndex >= serverPagination.pageCount - 1 : !table.getCanNextPage()}>
            {t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
