import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-xl border border-dashed border-herb-border bg-black/20 p-8 text-center", className)}>
      <p className="font-heading text-2xl text-white">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/60">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
