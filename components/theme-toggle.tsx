"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, saving, toggle } = useTheme();
  const t = useTranslations("topbar");
  const label = t(theme === "dark" ? "lightMode" : "darkMode");
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={label} aria-busy={saving} disabled={saving} onClick={toggle}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
