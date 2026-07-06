"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BatchSettings } from "@/lib/batches";

type Props = {
  clientId: string;
  settings: BatchSettings | null;
};

export function BatchSettingsForm({ clientId, settings }: Props) {
  const t = useTranslations("batches");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/clients/${clientId}/batches/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, googleDriveFolderUrl })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("settingsSaveError"));
      setLabel("");
      setGoogleDriveFolderUrl("");
      toast.success(t("folderSaved"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settingsSaveError"));
    } finally {
      setLoading(false);
    }
  }

  async function remove(folderId: string) {
    const confirmed = window.confirm(t("removeFolderConfirm"));
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/batches/settings`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("folderRemoveError"));
      toast.success(t("folderRemoved"));
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("folderRemoveError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div className="grid gap-2">
            <Label htmlFor="label" className="text-xs uppercase tracking-[0.16em] text-white/45">
              Label
            </Label>
            <Input
              id="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Rocco Batches"
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="googleDriveFolderUrl" className="text-xs uppercase tracking-[0.16em] text-white/45">
              {t("rootFolderLabel")}
            </Label>
            <Input
              id="googleDriveFolderUrl"
              value={googleDriveFolderUrl}
              onChange={(event) => setGoogleDriveFolderUrl(event.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="h-11"
            />
          </div>
        </div>
        <Button type="submit" disabled={loading || pending || !googleDriveFolderUrl.trim()}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addFolder")}
        </Button>
      </form>

      <div className="space-y-3">
        {(settings?.folders ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-herb-border bg-black/20 p-4 text-sm text-white/55">
            {t("noFoldersYet")}
          </div>
        ) : null}
        {settings?.folders.map((folder) => (
          <div key={folder.id} className="flex flex-col gap-3 rounded-xl border border-herb-border bg-black/20 p-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-white">{folder.label}</p>
              <p className="mt-1 break-all font-mono text-xs text-white/45">{folder.googleDriveFolderId}</p>
              {folder.googleDriveFolderUrl ? <p className="mt-1 truncate text-xs text-white/40">{folder.googleDriveFolderUrl}</p> : null}
              <p className="mt-2 text-xs text-white/45">
                {t("statusLine", { status: folder.lastCheckStatus })}
                {folder.lastCheckedAt ? ` · ${t("lastCheckedAt", { date: new Date(folder.lastCheckedAt).toLocaleString(locale) })}` : ""}
              </p>
              {folder.lastCheckError ? <p className="mt-2 text-xs text-amber-200">{folder.lastCheckError}</p> : null}
            </div>
            <Button type="button" variant="outline" size="sm" className="border-herb-border" disabled={loading || pending} onClick={() => remove(folder.id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("removeFolder")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
