"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateClientDialogProps = {
  trigger?: "button" | "icon";
};

type MetaAdAccountOption = {
  id: string;
  accountId: string;
  name: string;
  currency: string | null;
  timezoneName: string | null;
};

export function CreateClientDialog({ trigger = "button" }: CreateClientDialogProps) {
  const t = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<MetaAdAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [useManualAccount, setUseManualAccount] = useState(false);

  useEffect(() => {
    if (!open || accounts.length > 0) return;

    let ignore = false;

    async function loadAccounts() {
      setAccountsLoading(true);
      setAccountsError(null);

      const response = await fetch("/api/meta/ad-accounts", { cache: "no-store" });
      const result = await response.json();

      if (ignore) return;

      setAccountsLoading(false);

      if (!response.ok) {
        setAccountsError(result.error ?? t("metaAdAccountsLoadError"));
        setUseManualAccount(true);
        return;
      }

      setAccounts(result.accounts ?? []);
      setUseManualAccount((result.accounts ?? []).length === 0);
    }

    loadAccounts().catch((error) => {
      if (ignore) return;
      setAccountsLoading(false);
      setAccountsError(error instanceof Error ? error.message : t("metaAdAccountsLoadError"));
      setUseManualAccount(true);
    });

    return () => {
      ignore = true;
      setAccountsLoading(false);
    };
  }, [accounts.length, open, t]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const manualMetaAccountId = String(formData.get("manualMetaAccountId") ?? "");
    const payload = {
      name: formData.get("name"),
      metaAccountId: useManualAccount ? manualMetaAccountId : selectedAccountId,
      brandName: formData.get("brandName"),
      targetAudience: formData.get("targetAudience")
    };

    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      toast.error(result.error ?? t("clientCreateError"));
      return;
    }

    toast.success(t("clientCreated"));
    setOpen(false);
    window.dispatchEvent(new Event("herbads-clients-changed"));
    router.refresh();
    router.push(`/clients/${result.client.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger === "icon" ? (
          <Button variant="gradient" size="icon" className="hidden shadow-lg shadow-primary/20 sm:inline-flex" aria-label={t("createClient")}>
            <Plus className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="gradient">{t("createClient")}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createClient")}</DialogTitle>
          <DialogDescription>
            {t("createClientDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("clientName")}</Label>
            <Input id="name" name="name" placeholder={t("clientNamePlaceholder")} required />
          </div>
          <div className="space-y-2">
            <Label>{t("metaAdAccount")}</Label>
            {useManualAccount ? (
              <Input name="manualMetaAccountId" placeholder={t("metaAdAccountPlaceholder")} required />
            ) : (
              <select
                className="flex h-10 w-full rounded-md border border-input bg-black/20 px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                required
                disabled={accountsLoading || accounts.length === 0}
              >
                <option value="" className="bg-herb-surface text-white">
                  {accountsLoading ? t("adAccountsLoading") : t("selectAdAccount")}
                </option>
                {accounts.map((account) => (
                  <option key={account.accountId} value={account.accountId} className="bg-herb-surface text-white">
                      {account.name} · {account.accountId}
                  </option>
                ))}
              </select>
            )}
            {accountsError ? <p className="text-xs leading-5 text-amber-300">{accountsError}</p> : null}
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setUseManualAccount((current) => !current)}
            >
              {useManualAccount ? t("selectFromMetaList") : t("enterAdAccountManually")}
            </button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brandName">{t("brandNameOptional")}</Label>
            <Input id="brandName" name="brandName" placeholder={t("brandNamePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetAudience">{t("targetAudienceOptional")}</Label>
            <Input id="targetAudience" name="targetAudience" placeholder={t("targetAudiencePlaceholder")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="border-herb-border" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="gradient" disabled={loading}>
              {loading ? t("saving") : t("saveClient")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
