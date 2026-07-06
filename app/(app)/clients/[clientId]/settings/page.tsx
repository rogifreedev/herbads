import { getTranslations } from "next-intl/server";
import { ClientProfileForm } from "@/components/client-profile-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getClientById, getClientProfile } from "@/lib/clients";

export default async function ClientSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("clientSettings");
  const tCommon = await getTranslations("common");
  const [{ client, error: clientError }, { profile, error: profileError }] = await Promise.all([
    getClientById(clientId),
    getClientProfile(clientId)
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-primary">{t("kicker")}</p>
        <h2 className="mt-2 font-heading text-4xl">{client.name}</h2>
        <p className="mt-2 font-mono text-xs text-white/45">{client.adAccountId ?? tCommon("noAccount")}</p>
      </div>

      {clientError || profileError ? (
        <Alert variant="warning"><AlertDescription>{clientError ?? profileError}</AlertDescription></Alert>
      ) : null}

      <ClientProfileForm clientId={clientId} profile={profile} />
    </div>
  );
}
