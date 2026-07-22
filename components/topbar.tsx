"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckCircle2, LogOut, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ClientSwitcher } from "@/components/client-switcher";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getPageTitle } from "@/lib/routes";

export function Topbar() {
  const pathname = usePathname();
  const t = useTranslations("topbar");
  const tRoot = useTranslations();
  const showClientSwitcher = pathname !== "/dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center justify-between border-b border-herb-border bg-card/90 px-4 shadow-[var(--shadow-xs)] backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-semibold leading-none text-foreground">{tRoot(getPageTitle(pathname))}</h1>
          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{t("subtitle")}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 md:flex">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("metaSynced")}
        </div>
        {showClientSwitcher ? <ClientSwitcher /> : null}
        <CreateClientDialog trigger="icon" />
        <Button variant="ghost" size="icon" className="hidden text-foreground/65 hover:text-foreground sm:inline-flex" aria-label={t("notifications")}>
          <Bell className="h-5 w-5" />
        </Button>
        <LanguageSwitcher />
        <Button asChild variant="ghost" size="icon" className="text-foreground/65 hover:text-foreground">
          <Link href="/settings" aria-label={t("settings")}>
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="icon" className="text-foreground/65 hover:text-foreground" aria-label={t("logout")}>
            <LogOut className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </header>
  );
}
