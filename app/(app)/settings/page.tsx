import { IntegrationsDataTable } from "@/components/integrations-data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalEnv } from "@/lib/env";

export default function SettingsPage() {
  const integrations = [
    { label: "Supabase URL", key: "NEXT_PUBLIC_SUPABASE_URL", configured: Boolean(getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL")) },
    { label: "Supabase Anon Key", key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", configured: Boolean(getOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")) },
    { label: "Supabase Service Role", key: "SUPABASE_SERVICE_ROLE_KEY", configured: Boolean(getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY")) },
    { label: "Meta System User Token", key: "META_SYSTEM_USER_ACCESS_TOKEN", configured: Boolean(getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN")) },
    { label: "Meta App ID", key: "META_APP_ID", configured: Boolean(getOptionalEnv("META_APP_ID")) },
    { label: "OpenRouter API Key", key: "OPENROUTER_API_KEY", configured: Boolean(getOptionalEnv("OPENROUTER_API_KEY")) },
    { label: "OpenAI API Key", key: "OPENAI_API_KEY", configured: Boolean(getOptionalEnv("OPENAI_API_KEY")) },
    { label: "Cron Secret", key: "CRON_SECRET", configured: Boolean(getOptionalEnv("CRON_SECRET")) }
  ];
  const configuredCount = integrations.filter((integration) => integration.configured).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-4xl">Einstellungen</h2>
        <p className="mt-2 text-sm text-white/60">Globale App-, Integrations- und Nutzer-Einstellungen.</p>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard label="Integrationen" value={`${configuredCount}/${integrations.length}`} />
        <StatusCard label="Node Runtime" value={process.versions.node} />
        <StatusCard label="Daily Sync Lookback" value={`${getOptionalEnv("META_DAILY_SYNC_LOOKBACK_DAYS", "7")} Tage`} />
      </section>
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Integrationen</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationsDataTable integrations={integrations} />
          <p className="mt-3 text-xs text-white/45">Werte werden aus Sicherheitsgruenden nicht angezeigt, nur der Konfigurationsstatus.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
        <p className="mt-2 font-heading text-3xl text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
