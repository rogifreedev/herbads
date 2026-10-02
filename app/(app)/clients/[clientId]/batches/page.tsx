import Link from "next/link";
import { Settings } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BatchCheckButton } from "@/components/batch-check-button";
import { BatchCheckTable } from "@/components/batch-check-table";
import { BatchStatusRefresh } from "@/components/batch-status-refresh";
import { BatchesSectionNav } from "@/components/batches-section-nav";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBatchOverview, isBatchSnapshotStale } from "@/lib/batches";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BatchesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("batches");
  const locale = await getLocale();
  const overview = await getBatchOverview(clientId);
  const settings = overview.settings;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Batches</h2>
          <p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
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
              title={t("noFolderTitle")}
              description={t("noFolderDescription")}
              action={<Button asChild variant="gradient"><Link href={`/clients/${clientId}/batches/settings`}>{t("openSettings")}</Link></Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {overview.items.some((item) => item.match?.id) ? <BatchStatusRefresh key={clientId} clientId={clientId} /> : null}
          {settings.lastCheckError ? (
            <Alert variant="warning">
              <AlertDescription>{settings.lastCheckError}</AlertDescription>
            </Alert>
          ) : null}
          {settings.lastCheckStatus === "running" ? (
            <Alert>
              <AlertDescription>{t("checkRunning")}</AlertDescription>
            </Alert>
          ) : null}
          {settings.lastCheckStatus !== "running" && isBatchSnapshotStale(settings.lastCheckedAt) ? (
            <Alert variant="warning">
              <AlertDescription>
                {settings.lastCheckedAt ? t("staleCheck") : t("noStoredCheck")} {t("startCheckHint")}
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="grid gap-4 md:grid-cols-5">
            <SummaryCard label={t("rootFolders")} value={formatNumber(settings.folders.length)} />
            <SummaryCard label={t("statusLive")} value={formatNumber(overview.totals.live)} />
            <SummaryCard label={t("statusFound")} value={formatNumber(overview.totals.found)} />
            <SummaryCard label={t("statusMissing")} value={formatNumber(overview.totals.missing)} />
            <SummaryCard label={t("lastCheck")} value={settings.lastCheckedAt ? formatDateTime(settings.lastCheckedAt, locale) : "-"} />
          </section>

          <Card className="border-herb-border bg-herb-surface/90">
            <CardHeader>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <CardTitle>Batch Check</CardTitle>
                  <CardDescription>
                    {t("checkSummary", { metaEntities: formatNumber(overview.totals.metaEntities), folders: formatNumber(settings.folders.length) })}
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
                  title={t("noSnapshotTitle")}
                  description={t("noSnapshotDescription")}
                  action={<BatchCheckButton clientId={clientId} disabled={settings.lastCheckStatus === "running"} />}
                />
              ) : (
                <BatchCheckTable key={clientId} rows={overview.items} clientId={clientId} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
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
