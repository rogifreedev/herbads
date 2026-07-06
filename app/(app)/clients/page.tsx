import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClients } from "@/lib/clients";

export default async function ClientsPage() {
  const t = await getTranslations("clients");
  const { clients, error } = await listClients();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-heading text-4xl">{t("title")}</h2>
          <p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
        </div>
        <CreateClientDialog />
      </div>

      {error ? (
        <Alert variant="warning"><AlertDescription>{t("migrationAlert")}</AlertDescription></Alert>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState title={t("createFirstClient")} description={t("createFirstClientDescription")} action={<CreateClientDialog />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {clients.map((client) => (
            <Card key={client.id} className="border-herb-border bg-herb-surface/90 transition hover:border-primary/60">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-2xl">{client.name}</CardTitle>
                  <Badge variant={client.source === "mock" ? "warning" : client.status === "active" ? "success" : "warning"}>
                    {client.source === "mock" ? "mock" : client.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-mono text-xs text-white/55">{client.adAccountId ?? t("noMetaAccount")}</p>
                <Button asChild variant="outline" className="w-full border-herb-border">
                  <Link href={`/clients/${client.id}`}>{t("openDashboard")}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
