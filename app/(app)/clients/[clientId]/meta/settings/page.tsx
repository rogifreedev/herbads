import { getTranslations } from "next-intl/server";
import { MetaBackfillCard } from "@/components/meta-backfill-card";
import { MetaSyncButton } from "@/components/meta-sync-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientById } from "@/lib/clients";

export default async function MetaAdsSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("metaSettings");
  const tCommon = await getTranslations("common");
  const { client, error } = await getClientById(clientId);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-primary">META Ads</p>
        <h2 className="mt-2 font-heading text-4xl">Settings</h2>
        <p className="mt-2 font-mono text-xs text-white/45">{client.adAccountId ?? tCommon("noAccount")}</p>
      </div>

      {error ? (
        <Alert variant="warning">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,520px)_1fr]">
        <Card className="border-herb-border bg-herb-surface/90">
          <CardHeader>
            <CardTitle>{t("syncTitle")}</CardTitle>
            <CardDescription>{t("syncDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <MetaSyncButton clientId={client.id} />
          </CardContent>
        </Card>

        <MetaBackfillCard clientId={client.id} />
      </section>
    </div>
  );
}
