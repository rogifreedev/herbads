"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState(settings?.googleDriveFolderUrl ?? settings?.googleDriveFolderId ?? "");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/clients/${clientId}/batches/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ googleDriveFolderUrl })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Batch Settings konnten nicht gespeichert werden.");
      toast.success("Batch Settings gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Batch Settings konnten nicht gespeichert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="googleDriveFolderUrl" className="text-xs uppercase tracking-[0.16em] text-white/45">
          Google Drive Batch-Ordner
        </Label>
        <Input
          id="googleDriveFolderUrl"
          value={googleDriveFolderUrl}
          onChange={(event) => setGoogleDriveFolderUrl(event.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          className="h-11"
        />
      </div>
      {settings?.googleDriveFolderId ? (
        <p className="font-mono text-xs text-white/45">Folder ID: {settings.googleDriveFolderId}</p>
      ) : null}
      <Button type="submit" disabled={loading || pending || !googleDriveFolderUrl.trim()}>
        <Save className="mr-2 h-4 w-4" />
        Speichern
      </Button>
    </form>
  );
}
