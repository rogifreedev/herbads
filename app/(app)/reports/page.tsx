import { getTranslations } from "next-intl/server";
import { ReportsDataTable, type ReportTableRow } from "@/components/reports-data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClients } from "@/lib/clients";
import { getClientReportSummaries } from "@/lib/reports";

export default async function ReportsPage() {
  const t = await getTranslations("reports");
  const [{ clients, error }, summaries] = await Promise.all([listClients(), getClientReportSummaries()]);
  const realClients = clients.filter((client) => client.source === "supabase");
  const summaryByClient = new Map(summaries.map((summary) => [summary.clientId, summary]));
  const clientReports = realClients.map((client) => {
    const summary = summaryByClient.get(client.id);
    return {
      clientId: client.id,
      clientName: client.name,
      creatives: summary?.creatives ?? 0,
      analyzed: summary?.analyzed ?? 0,
      totalSpend: summary?.totalSpend ?? 0,
      purchases: summary?.purchases ?? 0,
      avgScore: summary?.avgScore ?? null,
      topCreativeName: summary?.topCreativeName ?? null
    } satisfies ReportTableRow;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-4xl">{t("title")}</h2>
        <p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
      </div>
      {error ? (
        <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>{t("overviewTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportsDataTable reports={clientReports} />
        </CardContent>
      </Card>
    </div>
  );
}
