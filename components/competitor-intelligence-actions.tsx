"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Competitor } from "@/lib/competitors";

type Props = {
  clientId: string;
  competitors: Competitor[];
};

export function CompetitorCreateForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [metaAdLibraryUrl, setMetaAdLibraryUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, metaAdLibraryUrl, websiteUrl })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Competitor konnte nicht gespeichert werden.");
      setName("");
      setMetaAdLibraryUrl("");
      setWebsiteUrl("");
      toast.success("Competitor gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Competitor konnte nicht gespeichert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
      <label className="grid gap-1 text-xs text-white/55">Name<Input value={name} onChange={(event) => setName(event.target.value)} className="h-9" /></label>
      <label className="grid gap-1 text-xs text-white/55">Website<Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className="h-9" /></label>
      <label className="grid gap-1 text-xs text-white/55">Ad Library Link<Input value={metaAdLibraryUrl} onChange={(event) => setMetaAdLibraryUrl(event.target.value)} className="h-9" /></label>
      <Button type="button" disabled={loading || pending} onClick={submit}>Speichern</Button>
    </div>
  );
}

export function CompetitorSourceForm({ clientId, competitors }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [competitorId, setCompetitorId] = useState("none");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitorId: competitorId === "none" ? null : competitorId, url })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Source konnte nicht gespeichert werden.");
      setUrl("");
      toast.success("Ad Library Source gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Source konnte nicht gespeichert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2 md:grid-cols-[220px_1fr_auto] md:items-end">
      <label className="grid gap-1 text-xs text-white/55">Competitor
        <Select value={competitorId} onValueChange={setCompetitorId}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ohne Zuordnung</SelectItem>
            {competitors.map((competitor) => <SelectItem key={competitor.id} value={competitor.id}>{competitor.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-white/55">Meta Ad Library Link<Input value={url} onChange={(event) => setUrl(event.target.value)} className="h-9" /></label>
      <Button type="button" disabled={loading || pending} onClick={submit}>Link speichern</Button>
    </div>
  );
}

export function CompetitorCreativeForm({ clientId, competitors }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [competitorId, setCompetitorId] = useState("none");
  const [format, setFormat] = useState("reel");
  const [sourceUrl, setSourceUrl] = useState("");
  const [hook, setHook] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [reachMin, setReachMin] = useState("");
  const [reachMax, setReachMax] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/creatives`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitorId: competitorId === "none" ? null : competitorId,
          format,
          sourceUrl,
          hook,
          primaryText,
          headline,
          reachMin,
          reachMax,
          startedAt,
          endedAt,
          imageUrl
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Competitor Creative konnte nicht gespeichert werden.");
      setSourceUrl("");
      setHook("");
      setPrimaryText("");
      setHeadline("");
      setReachMin("");
      setReachMax("");
      setStartedAt("");
      setEndedAt("");
      setImageUrl("");
      toast.success("Competitor Creative gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Competitor Creative konnte nicht gespeichert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <label className="grid gap-1 text-xs text-white/55">Competitor
          <Select value={competitorId} onValueChange={setCompetitorId}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ohne Zuordnung</SelectItem>
              {competitors.map((competitor) => <SelectItem key={competitor.id} value={competitor.id}>{competitor.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-white/55">Format
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reel">Reel</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="static">Static</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-white/55">Reach Min<Input value={reachMin} onChange={(event) => setReachMin(event.target.value)} inputMode="numeric" className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Reach Max<Input value={reachMax} onChange={(event) => setReachMax(event.target.value)} inputMode="numeric" className="h-9" /></label>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="grid gap-1 text-xs text-white/55">Startdatum<Input value={startedAt} onChange={(event) => setStartedAt(event.target.value)} placeholder="YYYY-MM-DD" className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Enddatum<Input value={endedAt} onChange={(event) => setEndedAt(event.target.value)} placeholder="optional" className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Asset URL<Input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="h-9" /></label>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-white/55">Ad Library URL<Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Hook<Input value={hook} onChange={(event) => setHook(event.target.value)} className="h-9" /></label>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-white/55">Headline<Input value={headline} onChange={(event) => setHeadline(event.target.value)} className="h-9" /></label>
        <label className="grid gap-1 text-xs text-white/55">Primary Text<Input value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} className="h-9" /></label>
      </div>
      <Button type="button" disabled={loading || pending} onClick={submit}>Creative speichern</Button>
    </div>
  );
}

export function CompetitorAnalyzeButton({ clientId, creativeId }: { clientId: string; creativeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/creatives/${creativeId}/analyze`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Analyse fehlgeschlagen.");
      toast.success("Competitor Creative analysiert.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analyse fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="border-herb-border" disabled={loading || pending} onClick={analyze}>
      <Sparkles className="mr-2 h-4 w-4" />
      Analysieren
    </Button>
  );
}

export function CompetitorSourceCrawlButton({ clientId, sourceId, status }: { clientId: string; sourceId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const disabled = loading || pending || status === "running";

  async function crawl() {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/competitors/sources/${sourceId}/crawl`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Crawl fehlgeschlagen.");
      toast.success("Competitor Source gecrawlt.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Crawl fehlgeschlagen.");
      startTransition(() => router.refresh());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="border-herb-border" disabled={disabled} onClick={crawl}>
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading || status === "running" ? "Crawl läuft" : "Crawl starten"}
    </Button>
  );
}
