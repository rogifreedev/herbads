import Link from "next/link";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClients } from "@/lib/clients";

export default async function ClientsPage() {
  const { clients, error } = await listClients();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-heading text-4xl">Kunden</h2>
          <p className="mt-2 text-sm text-white/60">Verwalte Kunden, Meta Ad Accounts und Creative Intelligence Daten.</p>
        </div>
        <CreateClientDialog />
      </div>

      {error ? (
        <Alert variant="warning"><AlertDescription>Supabase ist verbunden, aber die Kundentabellen sind noch nicht erreichbar. Aktuell werden Mock-Daten angezeigt. Fuehre die Migration aus `supabase/migrations/202605110001_initial_schema.sql` im Supabase SQL Editor aus.</AlertDescription></Alert>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState title="Ersten Kunden anlegen" description="Lege einen Kunden mit Meta Ad Account ID an. Danach kannst du Creatives, Wissen und Performance-Daten pro Kunde verbinden." action={<CreateClientDialog />} />
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
                <p className="font-mono text-xs text-white/55">{client.adAccountId ?? "Kein Meta Account hinterlegt"}</p>
                <Button asChild variant="outline" className="w-full border-herb-border">
                  <Link href={`/clients/${client.id}`}>Dashboard öffnen</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
