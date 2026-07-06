"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar
} from "@/components/ui/sidebar";
import { navItems } from "@/lib/navigation";
import { getActiveClientId, getDefaultClientId } from "@/lib/routes";
import { SidebarNavItem } from "@/components/sidebar-nav-item";

type SidebarNavProps = {
  onNavigate?: () => void;
};

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { setOpenMobile } = useSidebar();
  const [defaultClientId, setDefaultClientId] = useState<string | undefined>();
  const activeClientId = getActiveClientId(pathname) ?? defaultClientId;
  const closeMobile = onNavigate ?? (() => setOpenMobile(false));

  useEffect(() => {
    setDefaultClientId(getActiveClientId(pathname) ?? getDefaultClientId());
  }, [pathname]);

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <Image src="/assets/herb-logo.png" alt="HERB Media" width={42} height={42} className="h-10 w-10 shrink-0 rounded-md object-contain" priority />
          <div className="min-w-0 group-data-[state=collapsed]/sidebar-wrapper:md:hidden">
            <p className="font-heading text-lg font-semibold leading-none text-foreground">HERB Media</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("brandTagline")}</p>
          </div>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarNavItem key={item.title} item={item} activeClientId={activeClientId} onNavigate={closeMobile} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-xl border border-herb-border bg-secondary/70 p-3 group-data-[state=collapsed]/sidebar-wrapper:md:p-2">
          <div className="flex items-center justify-between gap-3">
            <div className="group-data-[state=collapsed]/sidebar-wrapper:md:hidden">
              <p className="text-sm font-semibold text-foreground">{t("metaSync")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("dailySyncReady")}</p>
            </div>
            <Badge variant="success">{t("live")}</Badge>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
