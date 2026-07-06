import { getTranslations } from "next-intl/server";
import { PredictionToolForm } from "@/components/prediction-tool-form";
import { PredictionToolTabs } from "@/components/prediction-tool-tabs";
import { Card, CardContent } from "@/components/ui/card";

export default async function PredictionToolPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("predictionTool");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-4xl">{t("title")}</h2>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          {t("subtitle")}
        </p>
      </div>

      <PredictionToolTabs clientId={clientId} active="analysis" />

      <section className="grid gap-4 md:grid-cols-3">
        <DataCard label="Meta KPIs" value="ROAS, CPA, CTR, Hook, Hold" />
        <DataCard label="Creative Patterns" value="Angles, Hooks, Brand Fit" />
        <DataCard label="Competitors" value="Reach, Spend, Winning Angles" />
      </section>

      <PredictionToolForm clientId={clientId} />
    </div>
  );
}

function DataCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-herb-border bg-herb-surface/90">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
        <p className="mt-2 text-sm text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
