import Link from "next/link";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";
import { CreativeTypeBadge } from "@/components/creative-type-badge";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/metrics";
import { getMetaAdSetDetail, type MetaAdSetAd, type MetaAdSetAdCreativeRow, type MetaAdSetCreative } from "@/lib/meta-adsets";

export const dynamic = "force-dynamic";

export default async function AdSetDetailPage({ params }: { params: Promise<{ clientId: string; adSetId: string }> }) {
  const { clientId, adSetId } = await params;
  const { adSet, campaign, rows, error } = await getMetaAdSetDetail(clientId, adSetId);

  if (!adSet) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" className="border-herb-border">
          <Link href={`/clients/${clientId}/batches`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurueck zu Batches
          </Link>
        </Button>
        <Alert variant="warning">
          <AlertDescription>{error ?? "Ad Set wurde nicht gefunden."}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const creativeIds = new Set(rows.map((row) => row.creative?.id).filter((id): id is string => Boolean(id)));
  const activeAds = rows.filter((row) => isLiveStatus(row.ad.status, row.ad.effectiveStatus)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4">
          <Button asChild variant="outline" size="sm" className="border-herb-border">
            <Link href={`/clients/${clientId}/batches`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Batches
            </Link>
          </Button>
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant={statusVariant(adSet.status, adSet.effectiveStatus)}>{adSet.effectiveStatus ?? adSet.status ?? "UNKNOWN"}</Badge>
              {adSet.optimizationGoal ? <Badge variant="outline">{adSet.optimizationGoal}</Badge> : null}
              {adSet.billingEvent ? <Badge variant="outline">{adSet.billingEvent}</Badge> : null}
            </div>
            <h2 className="max-w-5xl font-heading text-4xl leading-tight">{adSet.name}</h2>
            <p className="mt-2 font-mono text-xs text-white/45">{adSet.metaAdsetId}</p>
          </div>
        </div>
        <div className="grid min-w-full gap-3 sm:grid-cols-3 xl:min-w-[460px]">
          <SummaryCard label="Ads" value={formatNumber(rows.length)} />
          <SummaryCard label="Aktiv" value={formatNumber(activeAds)} />
          <SummaryCard label="Creatives" value={formatNumber(creativeIds.size)} />
        </div>
      </div>

      {error ? (
        <Alert variant="warning">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <InfoBox label="Campaign" value={campaign?.name ?? "Keine Campaign verknuepft"} meta={campaign?.metaCampaignId ?? null} />
        <InfoBox label="Erstellt" value={formatDate(adSet.createdAt)} />
        <InfoBox label="Zuletzt synchronisiert" value={formatDate(adSet.updatedAt)} />
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Ads und Creatives</CardTitle>
          <CardDescription>Alle Ads, die in diesem Meta Ad Set gespeichert sind, inklusive verknuepfter Creatives.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="Keine Ads gefunden" description="Fuer dieses Ad Set sind in Supabase noch keine Ads gespeichert. Starte bei Bedarf einen Meta Sync." />
          ) : (
            <AdSetAdsTable clientId={clientId} rows={rows} />
          )}
        </CardContent>
      </Card>
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

function InfoBox({ label, value, meta }: { label: string; value: string; meta?: string | null }) {
  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 line-clamp-2 font-medium text-white">{value}</p>
      {meta ? <p className="mt-1 font-mono text-xs text-white/40">{meta}</p> : null}
    </div>
  );
}

function AdSetAdsTable({ clientId, rows }: { clientId: string; rows: MetaAdSetAdCreativeRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-herb-border">
      <Table className="min-w-[1040px]">
        <TableHeader className="bg-white/[0.03]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Ad</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Creative</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Landingpage</TableHead>
            <TableHead>Update</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.ad.id} className="align-top">
              <TableCell>
                <p className="line-clamp-2 min-w-[240px] font-medium text-white">{row.ad.name}</p>
                <p className="mt-1 font-mono text-xs text-white/40">{row.ad.metaAdId}</p>
              </TableCell>
              <TableCell>
                <AdStatusBadge ad={row.ad} />
              </TableCell>
              <TableCell>
                <CreativeCell clientId={clientId} creative={row.creative} />
              </TableCell>
              <TableCell>{row.creative ? <CreativeTypeBadge type={row.creative.type} /> : <span className="text-white/45">-</span>}</TableCell>
              <TableCell>
                {row.creative?.landingUrl ? (
                  <Link href={row.creative.landingUrl} target="_blank" className="flex max-w-[240px] items-center gap-2 truncate text-primary hover:text-white">
                    <span className="truncate">{row.creative.landingUrl}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                ) : (
                  <span className="text-white/45">-</span>
                )}
              </TableCell>
              <TableCell className="text-white/60">{formatDate(row.ad.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CreativeCell({ clientId, creative }: { clientId: string; creative: MetaAdSetCreative | null }) {
  if (!creative) {
    return (
      <div className="flex min-w-[300px] items-center gap-3">
        <CreativePlaceholder />
        <div>
          <p className="font-medium text-white/55">Kein Creative verknuepft</p>
          <p className="mt-1 text-xs text-white/35">creative_id fehlt in meta_ads</p>
        </div>
      </div>
    );
  }

  const previewSrc = creative.thumbnailUrl ?? creative.imageUrl;

  return (
    <div className="flex min-w-[320px] items-center gap-3">
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewSrc} alt="" className="h-16 w-12 rounded-lg border border-herb-border object-cover" />
      ) : (
        <CreativePlaceholder />
      )}
      <div className="min-w-0">
        <Link href={`/clients/${clientId}/creatives/${creative.id}`} className="line-clamp-2 font-medium text-white hover:text-primary">
          {creative.name}
        </Link>
        {creative.body || creative.title ? <p className="mt-1 line-clamp-1 max-w-[280px] text-xs text-white/45">{creative.body ?? creative.title}</p> : null}
        <p className="mt-1 font-mono text-xs text-white/35">{creative.metaCreativeId}</p>
      </div>
    </div>
  );
}

function CreativePlaceholder() {
  return (
    <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-herb-border bg-white/[0.03] text-white/35">
      <ImageIcon className="h-5 w-5" />
    </div>
  );
}

function AdStatusBadge({ ad }: { ad: MetaAdSetAd }) {
  return <Badge variant={statusVariant(ad.status, ad.effectiveStatus)}>{ad.effectiveStatus ?? ad.status ?? "UNKNOWN"}</Badge>;
}

function isLiveStatus(status: string | null, effectiveStatus: string | null) {
  return status === "ACTIVE" || effectiveStatus === "ACTIVE";
}

function statusVariant(status: string | null, effectiveStatus: string | null): "success" | "warning" | "destructive" | "outline" {
  const normalized = (effectiveStatus ?? status ?? "").toUpperCase();
  if (normalized === "ACTIVE") return "success";
  if (normalized.includes("PAUSED") || normalized.includes("PENDING") || normalized.includes("LIMITED")) return "warning";
  if (normalized.includes("DISABLED") || normalized.includes("DELETED") || normalized.includes("ARCHIVED") || normalized.includes("REJECTED")) return "destructive";
  return "outline";
}
