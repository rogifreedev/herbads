import { ReportsDataTable, type ReportTableRow } from "@/components/reports-data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClients } from "@/lib/clients";
import { listClientCreatives } from "@/lib/creatives";

export default async function ReportsPage() {
  const { clients, error } = await listClients();
  const realClients = clients.filter((client) => client.source === "supabase");
  const clientReports = await Promise.all(
    realClients.map(async (client) => {
      const { creatives } = await listClientCreatives(client.id);
      const analyzed = creatives.filter((creative) => creative.hasAiAnalysis).length;
      const totalSpend = creatives.reduce((sum, creative) => sum + creative.metrics.spend, 0);
      const purchases = creatives.reduce((sum, creative) => sum + creative.metrics.purchases, 0);
      const avgScore = creatives.length > 0 ? Math.round(creatives.reduce((sum, creative) => sum + creative.performanceScore.score, 0) / creatives.length) : null;
      const topCreative = [...creatives].sort((a, b) => b.performanceScore.score - a.performanceScore.score)[0] ?? null;

      return {
        clientId: client.id,
        clientName: client.name,
        creatives: creatives.length,
        analyzed,
        totalSpend,
        purchases,
        avgScore,
        topCreativeName: topCreative?.name ?? null
      } satisfies ReportTableRow;
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-4xl">Reports</h2>
        <p className="mt-2 text-sm text-white/60">Exportierbare Creative Learnings und Kundenreports.</p>
      </div>
      {error ? (
        <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Report Uebersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportsDataTable reports={clientReports} />
        </CardContent>
      </Card>
    </div>
  );
}
