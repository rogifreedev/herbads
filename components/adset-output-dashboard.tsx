"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ExternalLink, ImageIcon, Layers, Loader2, RefreshCw, Video } from "lucide-react";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { KpiHelp } from "@/components/kpi-help";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdsetOutputReport, OutputMediaType } from "@/lib/adset-output-summary";

export function AdsetOutputDashboard() {
  const t = useTranslations("adsetOutput");
  const locale = useLocale();
  const params = useSearchParams();
  const since = params.get("since");
  const until = params.get("until");
  const range = params.get("range");
  const query = new URLSearchParams();
  if (since !== null) query.set("since", since);
  if (until !== null) query.set("until", until);
  if (range !== null) query.set("range", range);
  const queryKey = query.toString();
  const [revision, setRevision] = useState(0);
  const requestKey = `${queryKey}:${revision}`;
  const [result, setResult] = useState<{ key: string; data?: AdsetOutputReport; error?: string }>();
  const [expanded, setExpanded] = useState<string[]>([]);
  const loading = result?.key !== requestKey;
  const data = loading ? undefined : result?.data;
  const error = loading ? undefined : result?.error;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/adset-output?${queryKey}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error === "invalidDate" ? "invalidDate" : "loadError");
        return body as AdsetOutputReport;
      })
      .then((data) => { if (!controller.signal.aborted) setResult({ key: requestKey, data }); })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, error: error.message === "invalidDate" ? "invalidDate" : "loadError" });
      });
    return () => controller.abort();
  }, [queryKey, requestKey]);

  const types: OutputMediaType[] = ["video", "static"];
  if (data?.totals.mixed) types.push("mixed");
  if (data?.totals.unknown) types.push("unknown");
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
  const columns = types.length + 2;
  const metrics = [
    { key: "total" as const, icon: Layers, color: "text-primary" },
    { key: "video" as const, icon: Video, color: "text-sky-700 dark:text-sky-300" },
    { key: "static" as const, icon: ImageIcon, color: "text-emerald-700 dark:text-emerald-300" },
    ...types.filter((type) => type === "mixed" || type === "unknown").map((key) => ({ key, icon: Layers, color: "text-muted-foreground" }))
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <CreativeDateRangePicker defaultDays={30} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0" aria-label={t("refresh")} disabled={loading} onClick={() => setRevision((value) => value + 1)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("refresh")}</TooltipContent>
          </Tooltip>
        </div>
      </header>
      {error ? (
        <Alert variant="warning" role="alert">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {t(error)}
            {error !== "invalidDate" ? <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>{t("retry")}</Button> : null}
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <div role="status" className="flex min-h-60 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />{t("loading")}
        </div>
      ) : data ? (
        <>
          <dl className={`grid grid-cols-2 gap-5 border-b border-border pb-6 ${metrics.length === 3 ? "lg:grid-cols-3" : metrics.length === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3 xl:grid-cols-5"}`}>
            {metrics.map(({ key, icon: Icon, color }) => (
              <div key={key} className="min-w-0 space-y-2" data-output-metric={key}>
                <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />{t(key)}
                  {key === "total" ? <KpiHelp label={t(key)} description={t("definition")} /> : null}
                </dt>
                <dd className={`text-3xl font-semibold tabular-nums ${color}`}>{number(data.totals[key])}</dd>
              </div>
            ))}
          </dl>
          <section className="min-w-0 space-y-3" aria-labelledby="output-accounts-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="output-accounts-heading" className="text-lg font-semibold">{t("byAccount")}</h3>
              <span className="text-sm text-muted-foreground">{t("accountCount", { count: data.accounts.length })}</span>
            </div>
            {data.accounts.length === 0 ? <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">{t("empty")}</p> : (
              <Table aria-label={t("byAccount")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[230px]">{t("account")}</TableHead>
                    {types.map((type) => <TableHead key={type} className="text-right tracking-normal">{t(type)}</TableHead>)}
                    <TableHead className="text-right tracking-normal">{t("totalColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.accounts.map((account) => {
                    const open = expanded.includes(account.accountId);
                    return (
                      <Fragment key={account.accountId}>
                        <TableRow>
                          <TableCell>
                            <button type="button" className="flex w-full items-center gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={open} aria-controls={`output-${account.accountId}`}
                              onClick={() => setExpanded((ids) => open ? ids.filter((id) => id !== account.accountId) : [...ids, account.accountId])}>
                              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                              <span className="min-w-0"><span className="block font-medium">{account.clientName}</span><span className="block break-words text-xs text-muted-foreground">{account.accountName}</span></span>
                            </button>
                          </TableCell>
                          {types.map((type) => <TableCell key={type} className="text-right tabular-nums">{number(account.counts[type])}</TableCell>)}
                          <TableCell className="text-right font-semibold tabular-nums">{number(account.counts.total)}</TableCell>
                        </TableRow>
                        <TableRow id={`output-${account.accountId}`} hidden={!open}>
                          <TableCell colSpan={columns} className="bg-muted/30 py-2">
                            {open ? <ul className="divide-y divide-border">
                              {account.batches.map((batch) => (
                                <li key={batch.job_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                                  <time dateTime={batch.first_delivery_date} className="text-xs tabular-nums text-muted-foreground" title={t("firstDelivery")}>{date(batch.first_delivery_date)}</time>
                                  <Link className="min-w-0 flex-1 break-words font-medium hover:text-primary" href={`/clients/${batch.client_id}/batches/create?${new URLSearchParams({ folderId: batch.folder_id, jobId: batch.job_id })}`}>{batch.batch_name}</Link>
                                  <span className="text-xs text-muted-foreground">{t(batch.media_type)}</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button asChild size="icon" variant="ghost" className="shrink-0">
                                        <a href={`https://adsmanager.facebook.com/adsmanager/manage/adsets?${new URLSearchParams({ act: batch.meta_account_id.replace(/^act_/, ""), selected_adset_ids: batch.meta_adset_id })}`} target="_blank" rel="noreferrer" aria-label={t("openMeta", { name: batch.batch_name })}><ExternalLink className="h-4 w-4" /></a>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t("openMeta", { name: batch.batch_name })}</TooltipContent>
                                  </Tooltip>
                                </li>
                              ))}
                            </ul> : null}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
                <tfoot className="bg-muted/40 font-semibold">
                  <TableRow>
                    <TableCell>{t("totalColumn")}</TableCell>
                    {types.map((type) => <TableCell key={type} className="text-right tabular-nums">{number(data.totals[type])}</TableCell>)}
                    <TableCell className="text-right tabular-nums">{number(data.totals.total)}</TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            )}
          </section>
          <p className="text-xs text-muted-foreground">{t("dataSource")}</p>
        </>
      ) : null}
    </div>
  );
}
