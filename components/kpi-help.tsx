"use client";

import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { kpiTooltip } from "@/lib/kpi-tooltips";

export function KpiHelp({ label, description }: { label: string; description?: string | null }) {
  const content = description ?? kpiTooltip(label);
  if (!content) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/35 transition hover:border-primary/50 hover:text-primary" aria-label={`${label} erklaeren`}>
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="end">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
