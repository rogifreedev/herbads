"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type LandingpageAnalysisButtonProps = {
  clientId: string;
  urls: string[];
};

type StoredLandingpageJob = {
  items: string[];
  done: number;
  failed: number;
};

export function LandingpageAnalysisButton({ clientId, urls }: LandingpageAnalysisButtonProps) {
  const router = useRouter();
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const resumedRef = useRef(false);
  const storageKey = `herbads-bulk-landingpage-analysis:${clientId}`;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });

  const [jobItems, setJobItems] = useState<string[]>([]);

  const saveJob = useCallback((job: StoredLandingpageJob) => {
    window.localStorage.setItem(storageKey, JSON.stringify(job));
  }, [storageKey]);

  const clearJob = useCallback(() => {
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  const runQueue = useCallback(async (items: string[], startIndex = 0, initialFailed = 0) => {
    if (runningRef.current || items.length === 0) return;

    runningRef.current = true;
    cancelledRef.current = false;
    setRunning(true);
    setJobItems(items);
    setProgress({ done: startIndex, failed: initialFailed });
    saveJob({ items, done: startIndex, failed: initialFailed });

    let failed = initialFailed;
    for (let index = startIndex; index < items.length; index += 1) {
      if (cancelledRef.current) break;

      try {
        const response = await fetch(`/api/clients/${clientId}/landingpages/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: items[index] })
        });
        if (!response.ok) failed += 1;
      } catch {
        failed += 1;
      }

      const done = index + 1;
      setProgress({ done, failed });
      saveJob({ items, done, failed });
    }

    setRunning(false);
    runningRef.current = false;
    if (cancelledRef.current) {
      clearJob();
      toast.message("Landingpage-Analyse abgebrochen.");
    } else if (failed > 0) {
      clearJob();
      toast.warning(`Landingpage-Analyse fertig mit ${failed} Fehlern.`);
    } else {
      clearJob();
      toast.success("Landingpages analysiert.");
    }
    router.refresh();
  }, [clearJob, clientId, router, saveJob]);

  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;

    const rawJob = window.localStorage.getItem(storageKey);
    if (!rawJob) return;

    try {
      const job = JSON.parse(rawJob) as StoredLandingpageJob;
      if (!Array.isArray(job.items) || job.items.length === 0 || job.done >= job.items.length) {
        clearJob();
        return;
      }

      toast.message("Landingpage-Analyse wird nach Reload fortgesetzt.");
      runQueue(job.items, job.done, job.failed).catch(() => {
        runningRef.current = false;
        setRunning(false);
      });
    } catch {
      clearJob();
    }
  }, [clearJob, runQueue, storageKey]);

  async function analyzeLandingpages() {
    if (urls.length === 0) return;
    const confirmed = window.confirm(`${urls.length} sichtbare Landingpages crawlen und analysieren? Das startet ${urls.length} AI-Anfragen und externe Page-Fetches.`);
    if (!confirmed) return;

    await runQueue(urls);
  }

  if (running) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-white md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">Landingpage-Analyse laeuft</p>
          <p className="mt-1 text-xs text-white/60">
            {progress.done} von {jobItems.length} fertig{progress.failed > 0 ? `, ${progress.failed} Fehler` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" className="border-herb-border" onClick={() => { cancelledRef.current = true; }}>
          <X className="mr-2 h-4 w-4" />
          Abbrechen
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" className="border-herb-border" disabled={urls.length === 0} onClick={analyzeLandingpages}>
      <Globe className="mr-2 h-4 w-4" />
      Sichtbare Landingpages analysieren ({urls.length})
    </Button>
  );
}
