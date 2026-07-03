import Link from "next/link";
import { ExternalLink, Settings } from "lucide-react";
import { BatchRefreshButton } from "@/components/batch-refresh-button";
import { BatchesSectionNav } from "@/components/batches-section-nav";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { batchMetaMatchLabel, batchStatusLabel, getBatchOverview, type BatchOverviewItem } from "@/lib/batches";
import { formatDate, formatNumber } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function BatchesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const overview = await getBatchOverview(clientId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Batches</h2>
          <p className="mt-2 text-sm text-white/60">Google Drive Batch-Ordner gegen Meta Ads, Ad Sets und Campaigns pruefen.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <BatchRefreshButton />
          <BatchesSectionNav clientId={clientId} active="batches" />
        </div>
      </div>

      {overview.driveError ? <Alert variant="warning"><AlertDescription>{overview.driveError}</AlertDescription></Alert> : null}
      {overview.metaError ? <Alert variant="warning"><AlertDescription>{overview.metaError}</AlertDescription></Alert> : null}

      {!overview.settings ? (
        <Card className="border-herb-border bg-herb-surface/90">
          <CardContent className="p-6">
            <EmptyState
              title="Kein Batch-Ordner verbunden"
              description="Speichere zuerst den Google Drive Root-Folder fuer die Batch-Unterordner."
              action={<Button asChild variant="gradient"><Link href={`/clients/${clientId}/batches/settings`}>Settings oeffnen</Link></Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <SummaryCard label="Drive Ordner" value={formatNumber(overview.totals.folders)} />
            <SummaryCard label="Geschaltet" value={formatNumber(overview.totals.live)} />
            <SummaryCard label="Gefunden" value={formatNumber(overview.totals.found)} />
            <SummaryCard label="Nicht gefunden" value={formatNumber(overview.totals.missing)} />
          </section>

          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <CardTitle>Batch Check</CardTitle>
                  <CardDescription>
                    {formatNumber(overview.totals.metaEntities)} Meta-Namen im Abgleich. Rekursive Drive-Suche ab Root-Folder: {overview.settings.googleDriveFolderId}
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm" className="border-herb-border">
                  <Link href={`/clients/${clientId}/batches/settings`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {overview.items.length === 0 ? (
                <EmptyState title="Keine Batch-Unterordner gefunden" description="Der Drive-Ordner enthaelt aktuell keine sichtbaren Batch-Ordner oder der API-Zugriff ist nicht aktiv." />
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
      <Table className="min-w-[920px]">
        <TableHeader className="bg-white/[0.03]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Batch Ordner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Meta Match</TableHead>
            <TableHead>Drive geaendert</TableHead>
            <TableHead>Drive</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="align-top">
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
