"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type KnowledgeUploadFormProps = {
  clientId: string;
};

export function KnowledgeUploadForm({ clientId }: KnowledgeUploadFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const response = await fetch(`/api/clients/${clientId}/knowledge`, {
      method: "POST",
      body: new FormData(event.currentTarget)
    });
    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      toast.error(result.error ?? "Wissensdokument konnte nicht hochgeladen werden.");
      return;
    }

    toast.success("Wissensdokument gespeichert und indexiert.");
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Dokument hochladen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_220px] xl:grid-cols-[1fr_220px_260px_auto]">
          <div className="space-y-2">
            <Label htmlFor="knowledge-title">Titel</Label>
            <Input id="knowledge-title" name="title" placeholder="Optional, sonst Dateiname" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-type">Dokumenttyp</Label>
            <select
              id="knowledge-type"
              name="documentType"
              defaultValue="general"
              className="h-10 w-full rounded-md border border-input bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
            >
              <option value="general">Allgemein</option>
              <option value="brand">Brand</option>
              <option value="audience">Zielgruppe</option>
              <option value="offer">Angebot</option>
              <option value="claims">Claims / No-Gos</option>
              <option value="competitors">Wettbewerber</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-file">Datei</Label>
            <Input
              id="knowledge-file"
              name="file"
              type="file"
              accept=".txt,.md,.markdown,.json,.pdf,.docx,text/plain,text/markdown,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="gradient" disabled={loading} className="w-full">
              {loading ? "Indexiert..." : "Hochladen"}
            </Button>
          </div>
          <p className="text-xs leading-5 text-white/45 md:col-span-2 xl:col-span-4">
            Unterstuetzt TXT, Markdown, JSON, PDF und DOCX bis 10 MB. Wenn `OPENROUTER_API_KEY` oder `OPENAI_API_KEY` gesetzt ist, werden Chunks fuer Vector Search eingebettet.
          </p>
        </CardContent>
      </Card>
    </form>
  );
}
