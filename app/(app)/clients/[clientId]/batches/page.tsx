import Link from "next/link";
import { ExternalLink, Settings } from "lucide-react";
import { BatchCheckButton } from "@/components/batch-check-button";
import { BatchesSectionNav } from "@/components/batches-section-nav";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { batchMetaMatchLabel, batchStatusLabel, getBatchOverview, isBatchSnapshotStale, type BatchOverviewItem } from "@/lib/batches";
import { formatDate, formatNumber } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function BatchesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const overview = await getBatchOverview(clientId);
  const settings = overview.settings;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Batches</h2>
          <p className="mt-2 text-sm text-white/60">Gespeicherter Batch-Snapshot aus Supabase. Drive wird nur taeglich per Cron oder manuell ueberprueft.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {settings && settings.folders.length > 0 ? <BatchCheckButton clientId={clientId} disabled={settings.lastCheckStatus === "running"} /> : null}
          <BatchesSectionNav clientId={clientId} active="batches" />
        </div>
      </div>

      {!settings || settings.folders.length === 0 ? (
        <Card className="border-herb-border bg-herb-surface/90">
          <CardContent className="p-6">
            <EmptyState
              title="Kein Batch-Ordner verbunden"
              description="Speichere zuerst mindestens einen Google Drive Root-Folder fuer die Batch-Unterordner."
              action={<Button asChild variant="gradient"><Link href={`/clients/${clientId}/batches/settings`}>Settings oeffnen</Link></Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {settings.lastCheckError ? (
            <Alert variant="warning">
              <AlertDescription>{settings.lastCheckError}</AlertDescription>
            </Alert>
          ) : null}
          {settings.lastCheckStatus === "running" ? (
            <Alert>
              <AlertDescription>Batch Check laeuft gerade. Die Seite zeigt den letzten gespeicherten Snapshot.</AlertDescription>
            </Alert>
          ) : null}
          {settings.lastCheckStatus !== "running" && isBatchSnapshotStale(settings.lastCheckedAt) ? (
            <Alert variant="warning">
              <AlertDescription>
                {settings.lastCheckedAt ? "Der letzte Batch Check ist aelter als 24 Stunden." : "Es gibt noch keinen gespeicherten Batch Check."} Starte den Abgleich ueber Ueberpruefen.
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="grid gap-4 md:grid-cols-5">
            <SummaryCard label="Root Ordner" value={formatNumber(settings.folders.length)} />
            <SummaryCard label="Geschaltet" value={formatNumber(overview.totals.live)} />
            <SummaryCard label="Gefunden" value={formatNumber(overview.totals.found)} />
            <SummaryCard label="Nicht gefunden" value={formatNumber(overview.totals.missing)} />
            <SummaryCard label="Letzter Check" value={settings.lastCheckedAt ? formatDateTime(settings.lastCheckedAt) : "-"} />
          </section>

          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <CardTitle>Batch Check</CardTitle>
                  <CardDescription>
                    {formatNumber(overview.totals.metaEntities)} Meta-Namen im letzten Abgleich. {formatNumber(settings.folders.length)} Root-Ordner verbunden.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <BatchCheckButton clientId={clientId} disabled={settings.lastCheckStatus === "running"} />
                  <Button asChild variant="outline" size="sm" className="border-herb-border">
                    <Link href={`/clients/${clientId}/batches/settings`}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {overview.items.length === 0 ? (
                <EmptyState
                  title="Noch kein Batch Snapshot"
                  description="Starte einmal Ueberpruefen. Danach laedt diese Seite nur noch die gespeicherten Ergebnisse aus Supabase."
                  action={<BatchCheckButton clientId={clientId} disabled={settings.lastCheckStatus === "running"} />}
                />
              ) : (
                <BatchTable rows={overview.items} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
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

function BatchTable({ rows }: { rows: BatchOverviewItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-herb-border">
      <Table className="min-w-[1120px]">
        <TableHeader className="bg-white/[0.03]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Root</TableHead>
            <TableHead>Batch Ordner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Meta Match</TableHead>
            <TableHead>Drive geaendert</TableHead>
            <TableHead>Geprueft</TableHead>
            <TableHead>Drive</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.sourceFolderId ?? "root"}-${row.id}`} className="align-top">
              <TableCell>
                <Badge variant="outline">{row.sourceFolderLabel ?? "Drive Ordner"}</Badge>
              </TableCell>
              <TableCell>
                <p className="line-clamp-2 min-w-[260px] font-medium text-white">{row.name}</p>
                {row.path !== row.name ? <p className="mt-1 line-clamp-1 text-xs text-white/45">{row.path}</p> : null}
                <p className="mt-1 font-mono text-xs text-white/40">{row.id}</p>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(row.status)}>{batchStatusLabel(row.status)}</Badge>
              </TableCell>
              <TableCell>
                {row.match ? (
                  row.match.href ? (
                    <Link href={row.match.href} className="line-clamp-2 max-w-[360px] font-medium text-primary hover:text-white">
                      {batchMetaMatchLabel(row.match)}
                    </Link>
                  ) : (
                    <span className="line-clamp-2 max-w-[360px] text-white/75">{batchMetaMatchLabel(row.match)}</span>
                  )
                ) : (
                  <span className="text-white/45">-</span>
                )}
                {row.match ? (
                  <p className="mt-1 text-xs text-white/40">
                    Status: {row.match.effectiveStatus ?? row.match.status ?? "-"}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="text-white/60">{formatDate(row.modifiedTime)}</TableCell>
              <TableCell className="text-white/60">{formatDateTime(row.checkedAt)}</TableCell>
              <TableCell>
                {row.webViewLink ? (
                  <Button asChild variant="outline" size="sm" className="border-herb-border">
                    <Link href={row.webViewLink} target="_blank">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Oeffnen
                    </Link>
                  </Button>
                ) : (
                  <span className="text-white/45">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function statusVariant(status: BatchOverviewItem["status"]): "success" | "warning" | "destructive" {
  if (status === "live") return "success";
  if (status === "found") return "warning";
  return "destructive";
}
