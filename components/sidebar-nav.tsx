"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl herb-gradient font-heading text-lg font-bold text-white herb-glow">
            H
          </div>
          <div className="min-w-0 group-data-[state=collapsed]/sidebar-wrapper:md:hidden">
            <p className="font-heading text-2xl leading-none">Herb Ads</p>
            <p className="mt-1 text-xs text-white/55">Creative Intelligence</p>
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
        <div className="rounded-xl border border-herb-border bg-herb-surface p-3 group-data-[state=collapsed]/sidebar-wrapper:md:p-2">
          <div className="flex items-center justify-between gap-3">
            <div className="group-data-[state=collapsed]/sidebar-wrapper:md:hidden">
              <p className="text-sm font-medium">Meta Sync</p>
              <p className="mt-1 text-xs text-white/55">Daily Sync bereit</p>
            </div>
            <Badge variant="success">Live</Badge>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
