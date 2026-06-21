import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ImageIcon, Video } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PredictionToolTabs } from "@/components/prediction-tool-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCreativePredictionAnalyses, type CreativePredictionAnalysis } from "@/lib/prediction-history";
import { formatDate, formatNumber } from "@/lib/metrics";
import { cn } from "@/lib/utils";

type HistorySearchParams = {
  format?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function activeFormat(searchParams: HistorySearchParams): "all" | "static" | "video" {
  const value = firstSearchParam(searchParams.format);
  if (value === "static" || value === "video") return value;
  return "all";
}

function formatHref(clientId: string, format: "all" | "static" | "video") {
  if (format === "all") return `/clients/${clientId}/prediction-tool/history`;
  return `/clients/${clientId}/prediction-tool/history?format=${format}`;
}

export default async function PredictionHistoryPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<HistorySearchParams> }) {
  const [{ clientId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const format = activeFormat(resolvedSearchParams);
  const { analyses, error } = await listCreativePredictionAnalyses(clientId, format);
  const statics = analyses.filter((analysis) => analysis.format === "static").length;
  const videos = analyses.filter((analysis) => analysis.format === "video").length;
  const avgScore = analyses.length > 0 ? Math.round(analyses.reduce((sum, analysis) => sum + analysis.qualityScore, 0) / analyses.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Prediction History</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Gespeicherte Quality Scores fuer hochgeladene Statics und Videos inklusive Hook, Transcript, AI-Rationale und Benchmark-Snapshot.
          </p>
        </div>
        <Button asChild variant="gradient">
          <Link href={`/clients/${clientId}/prediction-tool`}>
            Neue Analyse
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <PredictionToolTabs clientId={clientId} active="history" />

      {error ? <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Analysen" value={formatNumber(analyses.length)} />
        <SummaryCard label="Avg. Score" value={analyses.length > 0 ? `${avgScore}/100` : "-"} />
        <SummaryCard label="Statics" value={formatNumber(statics)} />
        <SummaryCard label="Videos" value={formatNumber(videos)} />
      </section>

      <div className="flex flex-wrap gap-2">
        <FilterLink href={formatHref(clientId, "all")} active={format === "all"}>Alle</FilterLink>
        <FilterLink href={formatHref(clientId, "static")} active={format === "static"}>Statics</FilterLink>
        <FilterLink href={formatHref(clientId, "video")} active={format === "video"}>Videos</FilterLink>
      </div>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Analysierte Creatives</CardTitle>
        </CardHeader>
        <CardContent>
          {analyses.length === 0 ? (
            <EmptyState
              title="Noch keine Prediction History"
              description="Sobald du ein Creative analysierst, wird der Quality Score hier gespeichert."
              action={<Button asChild variant="gradient"><Link href={`/clients/${clientId}/prediction-tool`}>Analyse starten</Link></Button>}
            />
          ) : (
            <PredictionHistoryTable rows={analyses} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm transition",
        active ? "border-primary bg-primary text-white" : "border-herb-border bg-black/20 text-white/65 hover:border-primary/60 hover:text-white"
      )}
    >
      {children}
    </Link>
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

function PredictionHistoryTable({ rows }: { rows: CreativePredictionAnalysis[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-herb-border">
      <Table className="min-w-[980px]">
        <TableHeader className="bg-white/[0.03]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Creative</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Angle</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Hook / Overlay</TableHead>
            <TableHead>Erstellt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((analysis) => (
            <TableRow key={analysis.id} className="align-top transition hover:bg-white/[0.025]">
              <TableCell>
                <Link href={analysis.detailHref} className="group flex min-w-[220px] items-center gap-3 text-white hover:text-primary">
                  <Preview analysis={analysis} />
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium">{analysis.ai.summary || analysis.fileName}</span>
                    <span className="mt-1 block truncate text-xs text-white/45">{analysis.fileName}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-35 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={analysis.format === "video" ? "default" : "secondary"}>{analysis.format === "video" ? "Video" : "Static"}</Badge>
              </TableCell>
              <TableCell>{analysis.angle ? <Badge variant="outline">{analysis.angle}</Badge> : <span className="text-white/45">-</span>}</TableCell>
              <TableCell>
                <Badge variant={analysis.band === "high" ? "success" : analysis.band === "medium" ? "warning" : "secondary"}>{formatNumber(analysis.qualityScore)}/100</Badge>
              </TableCell>
              <TableCell className="text-white/70">{formatNumber(analysis.confidence)}%</TableCell>
              <TableCell className="max-w-[260px] text-white/65">
                <span className="line-clamp-2">{analysis.hook || analysis.headline || analysis.ai.detectedText || "-"}</span>
              </TableCell>
              <TableCell className="text-white/60">{formatDate(analysis.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Preview({ analysis }: { analysis: CreativePredictionAnalysis }) {
  if (analysis.previewFrame) {
    return (
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-herb-border bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={analysis.previewFrame.dataUrl} alt="" className="h-full w-full object-cover" />
        {analysis.format === "video" ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <Video className="h-4 w-4 text-white" />
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-herb-border bg-black/30 text-white/45">
      {analysis.format === "video" ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
    </span>
  );
}
