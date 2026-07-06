"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClientProfile } from "@/lib/clients";

type ClientProfileFormProps = {
  clientId: string;
  profile: ClientProfile;
};

export function ClientProfileForm({ clientId, profile }: ClientProfileFormProps) {
  const t = useTranslations("clientSettings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  function applyProfileToForm(nextProfile: ClientProfile) {
    const form = formRef.current;
    if (!form) return;

    for (const [key, value] of Object.entries(nextProfile)) {
      const field = form.elements.namedItem(key);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.value = value;
      }
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch(`/api/clients/${clientId}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    setSaving(false);

    if (!response.ok) {
      toast.error(result.error ?? t("saveError"));
      return;
    }

    toast.success(t("saved"));
    router.refresh();
  }

  async function generateFromKnowledge() {
    setGenerating(true);
    const response = await fetch(`/api/clients/${clientId}/profile/generate`, { method: "POST" });
    const result = await response.json();
    setGenerating(false);

    if (!response.ok) {
      toast.error(result.error ?? t("generateError"));
      return;
    }

    applyProfileToForm(result.profile);
    toast.success(t("generatedFromKnowledge"));
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("profileTitle")}</CardTitle>
            <Button type="button" variant="outline" className="border-herb-border" disabled={generating || saving} onClick={generateFromKnowledge}>
              {generating ? t("analyzingKnowledge") : t("fillFromKnowledge")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <Field label="Brand Name" name="brandName" defaultValue={profile.brandName} />
          <Field label="Tone of Voice" name="toneOfVoice" defaultValue={profile.toneOfVoice} />
          <TextAreaField label={t("positioning")} name="positioning" defaultValue={profile.positioning} />
          <TextAreaField label={t("targetAudience")} name="targetAudience" defaultValue={profile.targetAudience} />
          <TextAreaField label="Pain Points" name="painPoints" defaultValue={profile.painPoints} />
          <TextAreaField label="Buying Triggers" name="buyingTriggers" defaultValue={profile.buyingTriggers} />
          <TextAreaField label="USPs" name="usps" defaultValue={profile.usps} />
          <TextAreaField label={t("offers")} name="offers" defaultValue={profile.offers} />
          <TextAreaField label={t("forbiddenClaims")} name="forbiddenClaims" defaultValue={profile.forbiddenClaims} />
          <TextAreaField label="Brand No-Gos" name="brandNoGos" defaultValue={profile.brandNoGos} />
          <TextAreaField label={t("competitorsLabel")} name="competitors" defaultValue={profile.competitors} />
          <TextAreaField label={t("ctaPreferences")} name="ctaPreferences" defaultValue={profile.ctaPreferences} />
          <div className="lg:col-span-2">
            <Button type="submit" variant="gradient" disabled={saving || generating}>
              {saving ? tCommon("saving") : t("saveProfile")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} />
    </div>
  );
}

function TextAreaField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={defaultValue} />
    </div>
  );
}
