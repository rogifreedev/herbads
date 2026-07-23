import { getTranslations } from "next-intl/server";
import { MetaAdsTabs } from "@/components/meta-ads-tabs";
import { MetaCommentsSyncButton } from "@/components/meta-comments-sync-button";
import { MetaCommentsTable } from "@/components/meta-comments-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMetaCommentsOverview } from "@/lib/meta-comments";

export default async function CommentsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("comments");
  const overview = await getMetaCommentsOverview(clientId);
  const lastSync = overview.sync.lastSyncedAt ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(overview.sync.lastSyncedAt)) : t("never");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-heading text-4xl">{t("title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{t("subtitle")}</p>
        </div>
        <MetaCommentsSyncButton clientId={clientId} />
      </div>

      <MetaAdsTabs clientId={clientId} active="comments" />
      {overview.error ? <Alert variant="warning"><AlertDescription>{overview.error}</AlertDescription></Alert> : null}
      {overview.sync.failedStories ? <Alert variant="warning"><AlertDescription>{t("failedStories", { count: overview.sync.failedStories, error: overview.sync.lastError ?? t("unknownMetaError") })}</AlertDescription></Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t("totalComments")} value={overview.totals.comments} />
        <SummaryCard label={t("wordingCandidates")} value={overview.totals.candidates} />
        <SummaryCard label={t("analyzed")} value={overview.totals.analyzed} />
        <SummaryCard label={t("lastSync")} value={lastSync} compact />
      </section>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>{t("tableTitle")}</CardTitle>
          <CardDescription>{t("tableDescription", { stories: overview.sync.stories })}</CardDescription>
        </CardHeader>
        <CardContent><MetaCommentsTable clientId={clientId} comments={overview.comments} /></CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return <Card className="border-herb-border bg-herb-surface/90"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-white/45">{label}</p><p className={`mt-2 font-heading text-white ${compact ? "text-xl" : "text-3xl"}`}>{value}</p></CardContent></Card>;
}
