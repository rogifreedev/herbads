"use client";

import Link from "next/link";
import { memo, useDeferredValue, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Search, UploadCloud, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterBatchCheckRows, indexBatchCheckRows, type BatchCheckEntry } from "@/lib/batch-check-list";
import type { BatchOverviewItem } from "@/lib/batches";
import { formatNumber } from "@/lib/format";

function formatBatchDate(value: string | null, formatter: Intl.DateTimeFormat) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export function BatchCheckTable({ rows, clientId }: { rows: BatchOverviewItem[]; clientId: string }) {
  const t = useTranslations("batches");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => indexBatchCheckRows(rows), [rows]);
  const filtered = useMemo(() => filterBatchCheckRows(entries, deferredQuery), [entries, deferredQuery]);
  const pending = query !== deferredQuery;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full min-w-0 sm:max-w-md">
          {pending ? (
            <Loader2
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 animate-spin text-muted-foreground"
            />
          ) : (
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            />
          )}
          <Input
            ref={input}
            role="searchbox"
            aria-label={t("searchBatches")}
            aria-controls="batch-check-results"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            className="pl-9 pr-10"
          />
          {query ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1 h-8 w-8"
              aria-label={t("clearSearch")}
              title={t("clearSearch")}
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <p role="status" aria-live="polite" aria-atomic="true" className="shrink-0 text-sm text-muted-foreground">
          {t("filteredCount", { visible: formatNumber(filtered.length), total: formatNumber(entries.length) })}
        </p>
      </div>
      <div
        id="batch-check-results"
        aria-busy={pending}
        className="overflow-x-auto rounded-lg border border-herb-border"
      >
        <BatchResults entries={filtered} clientId={clientId} />
      </div>
    </div>
  );
}

const BatchResults = memo(function BatchResults({
  entries,
  clientId
}: {
  entries: BatchCheckEntry[];
  clientId: string;
}) {
  const t = useTranslations("batches");
  const tLaunch = useTranslations("batchLaunch");
  const locale = useLocale();
  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "Europe/Berlin",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
    [locale]
  );
  const dateOnly = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }),
    [locale]
  );
  const statusLabels = { live: t("statusLive"), found: t("statusFoundInactive"), missing: t("statusMissing") };
  const variants = { live: "success", found: "warning", missing: "destructive" } as const;

  return (
    <Table className="min-w-[1180px]" aria-label="Batch Check">
      <TableHeader className="bg-white/[0.03]">
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-16">{t("numberColumn")}</TableHead>
          <TableHead>Root</TableHead>
          <TableHead>{t("folderColumn")}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Meta Match</TableHead>
          <TableHead>{t("driveModified")}</TableHead>
          <TableHead>{t("checkedColumn")}</TableHead>
          <TableHead>Drive</TableHead>
          <TableHead>Meta</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
              {t("emptySearch")}
            </TableCell>
          </TableRow>
        ) : (
          entries.map(({ row, number }) => {
            const matchLabel = row.match ? `Ad Set: ${row.match.name}` : "";
            return (
              <TableRow key={`${row.sourceFolderId ?? "root"}-${row.id}`} className="align-top">
                <TableCell className="w-16 whitespace-nowrap tabular-nums text-muted-foreground">{number}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.sourceFolderLabel ?? t("driveFolderFallback")}</Badge>
                </TableCell>
                <TableCell>
                  <p className="line-clamp-2 min-w-[260px] font-medium text-white">{row.name}</p>
                  {row.path !== row.name ? <p className="mt-1 line-clamp-1 text-xs text-white/45">{row.path}</p> : null}
                  <p className="mt-1 font-mono text-xs text-white/40">{row.id}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={variants[row.status]}>{statusLabels[row.status]}</Badge>
                </TableCell>
                <TableCell>
                  {row.match ? (
                    row.match.href ? (
                      <Link
                        href={row.match.href}
                        className="line-clamp-2 max-w-[360px] font-medium text-primary hover:text-white"
                      >
                        {matchLabel}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 max-w-[360px] text-white/75">{matchLabel}</span>
                    )
                  ) : (
                    <span className="text-white/45">-</span>
                  )}
                  {row.match ? (
                    <p className="mt-1 text-xs text-white/40">
                      {t("statusLine", { status: row.match.effectiveStatus ?? row.match.status ?? "-" })}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-white/60">{formatBatchDate(row.modifiedTime, dateOnly)}</TableCell>
                <TableCell className="text-white/60">{formatBatchDate(row.checkedAt, dateTime)}</TableCell>
                <TableCell>
                  {row.webViewLink ? (
                    <Button asChild variant="outline" size="sm" className="border-herb-border">
                      <Link href={row.webViewLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t("open")}
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-white/45">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.status === "missing" ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/clients/${clientId}/batches/create?folderId=${encodeURIComponent(row.id)}`}>
                        <UploadCloud className="mr-2 h-4 w-4" />
                        {tLaunch("create")}
                      </Link>
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
});
