import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BatchSettingsForm } from "@/components/batch-settings-form";
import { BatchesSectionNav } from "@/components/batches-section-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBatchSettings } from "@/lib/batches";

export const dynamic = "force-dynamic";

export default async function BatchSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { settings, error } = await getBatchSettings(clientId);
  const hasDriveApiKey = Boolean(process.env.GOOGLE_DRIVE_API_KEY);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Batch Settings</h2>
          <p className="mt-2 text-sm text-white/60">Mehrere Google Drive Root- oder Kundenordner, unter denen Batch-Ordner gesucht werden.</p>
        </div>
        <BatchesSectionNav clientId={clientId} active="settings" />
      </div>

      {error ? <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {!hasDriveApiKey ? (
        <Alert variant="warning">
          <AlertDescription>GOOGLE_DRIVE_API_KEY fehlt. Speichern ist moeglich, der automatische Drive-Check startet nach dem Setzen des Keys.</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,560px)_1fr]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Google Drive Ordner</CardTitle>
            <CardDescription>Fuege beliebig viele Root-Ordner hinzu. Der Check sucht darunter rekursiv nach Batch-Ordnern.</CardDescription>
          </CardHeader>
          <CardContent>
            <BatchSettingsForm clientId={clientId} settings={settings} />
          </CardContent>
        </Card>

        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>Abgleich</CardTitle>
            <CardDescription>Exakte normalisierte Namen zaehlen zuerst, danach wird auf enthaltene Namen gematcht.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-white/65">
            <div className="rounded-xl border border-herb-border bg-black/20 p-4">
              <p className="font-medium text-white">Meta Status</p>
              <p className="mt-2">Ein Batch gilt als geschaltet, wenn der passende Meta-Eintrag aktiv ist.</p>
            </div>
            <Button asChild variant="outline" className="border-herb-border">
              <Link href={`/clients/${clientId}/batches`}>
                Batches pruefen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
