"use client";

import { CalendarIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "7 Tage", days: 7 },
  { label: "14 Tage", days: 14 },
  { label: "30 Tage", days: 30 },
  { label: "90 Tage", days: 90 }
];

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function defaultRange(days: number | undefined): DateRange | undefined {
  if (!days) return undefined;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  return { from, to };
}

function rangeFromParams(since: string | null, until: string | null, defaultDays?: number): DateRange | undefined {
  const from = parseDateParam(since);
  const to = parseDateParam(until);
  return from || to ? { from, to } : defaultRange(defaultDays);
}

function rangeLabel(range: DateRange | undefined) {
  if (range?.from && range.to) return `${formatDateLabel(range.from)} - ${formatDateLabel(range.to)}`;
  if (range?.from) return `ab ${formatDateLabel(range.from)}`;
  if (range?.to) return `bis ${formatDateLabel(range.to)}`;
  return "Alle Daten";
}

export function CreativeDateRangePicker({ defaultDays }: { defaultDays?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const isAllRange = searchParams.get("range") === "all";
  const [range, setRange] = useState<DateRange | undefined>(() => rangeFromParams(since, until, isAllRange ? undefined : defaultDays));

  useEffect(() => {
    setRange(rangeFromParams(since, until, isAllRange ? undefined : defaultDays));
  }, [defaultDays, isAllRange, since, until]);

  function pushRange(nextRange: DateRange | undefined) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("rankingPage");

    if (nextRange?.from) {
      nextParams.delete("range");
      nextParams.set("since", formatDateInput(nextRange.from));
    } else {
      nextParams.delete("since");
    }

    if (nextRange?.to) {
      nextParams.delete("range");
      nextParams.set("until", formatDateInput(nextRange.to));
    } else {
      nextParams.delete("until");
    }

    const query = nextParams.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
      setOpen(false);
    });
  }

  function clearRange() {
    setRange(undefined);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("rankingPage");
    nextParams.delete("since");
    nextParams.delete("until");
    nextParams.set("range", "all");
    const query = nextParams.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
      setOpen(false);
    });
  }

  function applyPreset(days: number) {
    const nextRange = defaultRange(days);
    setRange(nextRange);
    pushRange(nextRange);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start border-herb-border bg-black/25 text-left font-normal sm:w-[260px]", !range && "text-white/60")}
          disabled={isPending}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
          {rangeLabel(range)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0" sideOffset={8}>
        <div className="grid gap-2 border-b border-herb-border p-3 sm:grid-cols-5">
          {PRESETS.map((preset) => (
            <Button key={preset.days} type="button" variant="outline" size="sm" className="border-herb-border bg-black/20" onClick={() => applyPreset(preset.days)} disabled={isPending}>
              {preset.label}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" className="border-herb-border bg-black/20" onClick={clearRange} disabled={isPending}>
            Gesamt
          </Button>
        </div>
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          defaultMonth={range?.from ?? range?.to}
          numberOfMonths={2}
          disabled={{ after: new Date() }}
        />
        <div className="flex items-center justify-between gap-2 border-t border-herb-border p-3">
          <Button type="button" variant="ghost" size="sm" onClick={clearRange} disabled={isPending || !range}>
            Gesamter Zeitraum
          </Button>
          <Button type="button" size="sm" onClick={() => pushRange(range)} disabled={isPending}>
            Anwenden
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
