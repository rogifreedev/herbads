import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BatchSettingsForm } from "@/components/batch-settings-form";
import { BatchesSectionNav } from "@/components/batches-section-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBatchSettings } from "@/lib/batches";

export const dynamic = "force-dynamic";

export default async function BatchSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("batches");
  const { settings, error } = await getBatchSettings(clientId);
  const hasDriveApiKey = Boolean(process.env.GOOGLE_DRIVE_API_KEY);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-4xl">Batch Settings</h2>
          <p className="mt-2 text-sm text-white/60">{t("settingsSubtitle")}</p>
        </div>
        <BatchesSectionNav clientId={clientId} active="settings" />
      </div>

      {error ? <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {!hasDriveApiKey ? (
        <Alert variant="warning">
          <AlertDescription>{t("apiKeyMissing")}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,560px)_1fr]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>{t("driveFoldersTitle")}</CardTitle>
            <CardDescription>{t("driveFoldersDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BatchSettingsForm clientId={clientId} settings={settings} />
          </CardContent>
        </Card>

        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>{t("matchingTitle")}</CardTitle>
            <CardDescription>{t("matchingDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-white/65">
            <div className="rounded-xl border border-herb-border bg-black/20 p-4">
              <p className="font-medium text-white">{t("metaStatusTitle")}</p>
              <p className="mt-2">{t("liveRule")}</p>
            </div>
            <Button asChild variant="outline" className="border-herb-border">
              <Link href={`/clients/${clientId}/batches`}>
                {t("checkBatches")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
