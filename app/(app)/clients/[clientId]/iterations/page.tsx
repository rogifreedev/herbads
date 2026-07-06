import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdIterationStatusSelect } from "@/components/ad-iteration-status-select";
import { AdIterationsGenerateForm } from "@/components/ad-iterations-generate-form";
import { CreativeDateRangePicker } from "@/components/creative-date-range-picker";
import { EmptyState } from "@/components/empty-state";
import { MetaAdsTabs } from "@/components/meta-ads-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InsightDateRange } from "@/lib/date-filters";
import { resolveInsightDateFilters, firstSearchParam, type DateFilterSearchParams } from "@/lib/date-filters";
import { getAdIterationsOverview, iterationPerformanceLine, type AdIteration, type IterationFormat } from "@/lib/creative-iterations";
import { formatDate, formatNumber } from "@/lib/metrics";
import { cn } from "@/lib/utils";

function activeTab(searchParams: DateFilterSearchParams): IterationFormat {
  return firstSearchParam(searchParams.tab) === "videos" ? "video" : "static";
}

function tabHref(clientId: string, tab: "statics" | "videos", dateFilters: InsightDateRange) {
  const params = new URLSearchParams({ tab });

  if (dateFilters.range === "all") {
    params.set("range", "all");
  } else {
    if (dateFilters.since) params.set("since", dateFilters.since);
    if (dateFilters.until) params.set("until", dateFilters.until);
  }

  return `/clients/${clientId}/iterations?${params.toString()}`;
}

export default async function IterationsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<DateFilterSearchParams> }) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const t = await getTranslations("iterations");
  const tCommon = await getTranslations("common");
  const dateFilters = resolveInsightDateFilters(resolvedSearchParams);
  const tab = activeTab(resolvedSearchParams);
  const overview = await getAdIterationsOverview(clientId);
  const rows = tab === "video" ? overview.videos : overview.statics;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Iterations</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <CreativeDateRangePicker defaultDays={30} />
          <AdIterationsGenerateForm clientId={clientId} since={dateFilters.since} until={dateFilters.until} defaultFormat={tab === "video" ? "video" : "static"} />
        </div>
      </div>

      <MetaAdsTabs clientId={clientId} active="iterations" />

      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}
      {dateFilters.dateError ? <Alert variant="warning"><AlertDescription>{tCommon("dateRangeError")}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Iterations" value={formatNumber(overview.totals.all)} />
        <SummaryCard label="Statics" value={formatNumber(overview.totals.statics)} />
        <SummaryCard label="Videos" value={formatNumber(overview.totals.videos)} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Link className={tabClass(tab === "static")} href={tabHref(clientId, "statics", dateFilters)}>Statics</Link>
        <Link className={tabClass(tab === "video")} href={tabHref(clientId, "videos", dateFilters)}>Videos</Link>
      </div>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>{tab === "video" ? "Video Iterations" : "Static Iterations"}</CardTitle>
          <CardDescription>
            {tab === "video" ? t("videoDescription") : t("staticDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              title={tab === "video" ? t("noVideoIterations") : t("noStaticIterations")}
              description={t("noIterationsDescription")}
            />
          ) : tab === "video" ? (
            <VideoIterationsTable clientId={clientId} rows={rows} />
          ) : (
            <StaticIterationsTable clientId={clientId} rows={rows} />
          )}
        </CardContent>
      </Card>

      {overview.latestGenerations.length > 0 ? (
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>{t("latestGenerations")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-white/60 md:grid-cols-2 xl:grid-cols-4">
            {overview.latestGenerations.map((generation) => {
              const sourceCount = generationSourceCount(generation);
              const note = generationNote(generation);

              return (
                <div key={generation.id} className="rounded-xl border border-herb-border bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{generation.format}</span>
                    <Badge variant={generation.status === "completed" ? "success" : generation.status === "failed" ? "destructive" : "secondary"}>{generation.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-white/45">{generation.generation_key}</p>
                  <p className="mt-1 text-xs text-white/45">{formatDate(generation.created_at)}</p>
                  {sourceCount !== null ? <p className="mt-2 text-xs text-white/55">{t("sourcesCount", { count: formatNumber(sourceCount) })}</p> : null}
                  {note ? <p className="mt-2 text-xs leading-5 text-white/50">{note}</p> : null}
                  {generation.error_message ? <p className="mt-2 text-xs text-red-200">{generation.error_message}</p> : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function tabClass(active: boolean) {
  return cn(
    "rounded-lg border px-3 py-2 text-sm transition",
    active ? "border-primary bg-primary text-white" : "border-herb-border bg-black/20 text-white/65 hover:border-primary/60 hover:text-white"
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
        <p className="mt-2 font-heading text-3xl text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function generationSourceCount(generation: { prompt_context?: Record<string, unknown> | null }) {
  const context = recordValue(generation.prompt_context);
  const value = context?.sourceCount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function generationNote(generation: { prompt_context?: Record<string, unknown> | null; raw_response?: Record<string, unknown> | null }) {
  const raw = recordValue(generation.raw_response);
  const context = recordValue(generation.prompt_context);
  const diagnostics = recordValue(context?.sourceDiagnostics);
  const rawNote = raw?.note;
  const contextNote = context?.sourceSelectionNote;
  const diagnosticsNote = diagnostics?.note;

  if (typeof rawNote === "string" && rawNote) return rawNote;
  if (typeof contextNote === "string" && contextNote) return contextNote;
  if (typeof diagnosticsNote === "string" && diagnosticsNote) return diagnosticsNote;
  return null;
}

function SourceLink({ iteration }: { iteration: AdIteration }) {
  return (
    <Link href={iteration.sourceCreativeHref} className="group flex max-w-[220px] items-center gap-2 text-primary hover:text-white">
      <span className="truncate">{iteration.sourceCreativeName}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 transition group-hover:opacity-100" />
    </Link>
  );
}

function StaticIterationsTable({ clientId, rows }: { clientId: string; rows: AdIteration[] }) {
  const t = useTranslations("iterations");
  return (
    <div className="overflow-x-auto rounded-xl border border-herb-border">
      <Table className="min-w-[920px]">
        <TableHeader className="bg-white/[0.03]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Title</TableHead>
            <TableHead>Angle</TableHead>
            <TableHead>{t("template")}</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>{t("createdAtColumn")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((iteration) => (
            <TableRow key={iteration.id} className="align-top transition hover:bg-white/[0.025]">
              <TableCell className="max-w-[280px] font-medium">
                <Link href={iteration.detailHref} className="group flex items-center gap-2 text-white hover:text-primary">
                  <span className="line-clamp-2">{iteration.title}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-45 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              </TableCell>
              <TableCell>{iteration.angle ? <Badge variant="outline">{iteration.angle}</Badge> : <span className="text-white/45">-</span>}</TableCell>
              <TableCell><SourceLink iteration={iteration} /></TableCell>
              <TableCell className="text-white">{iteration.score === null ? "-" : `${formatNumber(iteration.score)}/100`}</TableCell>
              <TableCell><AdIterationStatusSelect clientId={clientId} iterationId={iteration.id} status={iteration.status} /></TableCell>
              <TableCell className="text-white/60">{formatDate(iteration.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function VideoIterationsTable({ clientId, rows }: { clientId: string; rows: AdIteration[] }) {
  const t = useTranslations("iterations");
  const tCommon = useTranslations("common");
  return (
    <div className="overflow-x-auto rounded-xl border border-herb-border">
      <Table className="min-w-[1240px]">
        <TableHeader className="bg-white/[0.03]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Title</TableHead>
            <TableHead>Angle</TableHead>
            <TableHead>{t("template")}</TableHead>
            <TableHead>Hook / Script</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>{t("createdAtColumn")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((iteration) => (
            <TableRow key={iteration.id} className="align-top transition hover:bg-white/[0.025]">
              <TableCell className="max-w-[260px]">
                <Link href={iteration.detailHref} className="group flex items-center gap-2 font-medium text-white hover:text-primary">
                  <span className="line-clamp-2">{iteration.title}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-45 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              </TableCell>
              <TableCell>{iteration.angle ? <Badge variant="outline">{iteration.angle}</Badge> : <span className="text-white/45">-</span>}</TableCell>
              <TableCell><SourceLink iteration={iteration} /></TableCell>
              <TableCell className="max-w-[360px] text-white/70">
                {iteration.hook ? <p className="font-medium text-white">{iteration.hook}</p> : null}
                <p className="mt-2 line-clamp-3">{iteration.script ?? iteration.description ?? "-"}</p>
                <p className="mt-2 text-xs text-white/40">{iterationPerformanceLine(iteration) ?? tCommon("noPerformanceSnapshot")}</p>
              </TableCell>
              <TableCell className="text-white">{iteration.score === null ? "-" : `${formatNumber(iteration.score)}/100`}</TableCell>
              <TableCell><AdIterationStatusSelect clientId={clientId} iterationId={iteration.id} status={iteration.status} /></TableCell>
              <TableCell className="text-white/60">{formatDate(iteration.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
