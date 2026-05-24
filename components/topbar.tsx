"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientSwitcher } from "@/components/client-switcher";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getPageTitle } from "@/lib/routes";

export function Topbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-herb-border bg-black/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Workspace</p>
          <h1 className="truncate font-heading text-2xl leading-none text-white">{getPageTitle(pathname)}</h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ClientSwitcher />
        <CreateClientDialog trigger="icon" />
        <Button asChild variant="ghost" size="icon" className="text-white/70 hover:text-white">
          <Link href="/settings" aria-label="Einstellungen">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon" className="text-white/70 hover:text-white">
          <Link href="/auth/logout" aria-label="Abmelden">
            <LogOut className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
