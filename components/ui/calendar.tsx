"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, components, ...props }: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 text-white", className)}
      classNames={{
        root: cn(defaultClassNames.root),
        months: "flex flex-col gap-4 sm:flex-row",
        month: "space-y-4",
        month_caption: "relative flex h-8 items-center justify-center",
        caption_label: "text-sm font-medium",
        nav: "absolute right-1 top-1 flex items-center gap-1",
        button_previous: cn(buttonVariants({ variant: "ghost" }), "h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100"),
        button_next: cn(buttonVariants({ variant: "ghost" }), "h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100"),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-[0.8rem] font-normal text-white/45",
        week: "mt-2 flex w-full",
        day: "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        range_start: "rounded-l-md bg-primary text-primary-foreground",
        range_middle: "rounded-none bg-primary/20 text-white hover:bg-primary/20 hover:text-white",
        range_end: "rounded-r-md bg-primary text-primary-foreground",
        today: "border border-primary/50 text-primary",
        outside: "text-white/25 aria-selected:bg-primary/20 aria-selected:text-white/50",
        disabled: "text-white/20 opacity-50",
        hidden: "invisible",
        dropdowns: "flex items-center justify-center gap-2",
        dropdown: "rounded-md border border-herb-border bg-herb-surface px-2 py-1 text-sm text-white outline-none focus:border-primary",
        ...classNames
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown;
          return <Icon className={cn("h-4 w-4", chevronClassName)} />;
        },
        ...components
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
