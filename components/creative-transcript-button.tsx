"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type CreativeTranscriptButtonProps = {
  clientId: string;
  creativeId: string;
  hasTranscript?: boolean;
  canTranscribe?: boolean;
};

export function CreativeTranscriptButton({ clientId, creativeId, hasTranscript = false, canTranscribe = true }: CreativeTranscriptButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function transcribe() {
    setLoading(true);
    const response = await fetch(`/api/clients/${clientId}/creatives/${creativeId}/transcript`, { method: "POST" });
    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      toast.error(result.error ?? "Video konnte nicht transkribiert werden.");
      return;
    }

    toast.success("Video-Transcript gespeichert.");
    router.refresh();
  }

  return (
    <Button type="button" variant={hasTranscript ? "outline" : "gradient"} className={hasTranscript ? "border-herb-border" : undefined} disabled={loading || !canTranscribe} onClick={transcribe}>
      <FileText className="mr-2 h-4 w-4" />
      {loading ? "Transkribiert..." : hasTranscript ? "Transcript aktualisieren" : "Video transkribieren"}
    </Button>
  );
}
