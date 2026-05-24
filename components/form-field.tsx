import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <Label className={cn("block", className)}>
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/45">{label}</span>
      {children}
    </Label>
  );
}
