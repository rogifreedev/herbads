"use client";

import { Check, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n-locales";

const LOCALE_LABEL_KEYS: Record<SupportedLocale, "german" | "italian"> = {
  de: "german",
  it: "italian"
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("topbar");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectLocale(nextLocale: SupportedLocale) {
    if (nextLocale === locale) return;
    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-foreground/65 hover:text-foreground" aria-label={t("language")} disabled={isPending}>
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((supportedLocale) => (
          <DropdownMenuItem key={supportedLocale} onSelect={() => selectLocale(supportedLocale)} className={supportedLocale === locale ? "font-semibold text-primary" : undefined}>
            {t(LOCALE_LABEL_KEYS[supportedLocale])}
            {supportedLocale === locale ? <Check className="ml-auto h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
