import { cn } from "@/lib/utils";

export function Progress({
  value,
  max,
  active = false,
  label,
  valueText,
  className
}: {
  value: number;
  max: number;
  active?: boolean;
  label: string;
  valueText: string;
  className?: string;
}) {
  const total = Number.isFinite(max) && max > 0 ? max : 1;
  const completed = Number.isFinite(value) ? Math.min(total, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completed}
      aria-valuetext={valueText}
      className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-border", className)}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${(completed / total) * 100}%` }}
      />
      {active ? (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="upload-progress-activity h-full w-[30%] rounded-full bg-primary/40" />
        </div>
      ) : null}
    </div>
  );
}
