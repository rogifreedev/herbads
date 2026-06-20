"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from "@/components/ui/sidebar";
import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { resolveClientHref } from "@/lib/routes";

type SidebarNavItemProps = {
  item: NavItem;
  activeClientId?: string;
  onNavigate?: () => void;
};

export function SidebarNavItem({ item, activeClientId, onNavigate }: SidebarNavItemProps) {
  const pathname = usePathname();
  const Icon = item.icon;
  const resolvedHref = resolveClientHref(item.href, activeClientId);
  const hasChildren = Boolean(item.children?.length);
  const isChildActive = useMemo(
    () => item.children?.some((child) => pathname === resolveClientHref(child.href, activeClientId)) ?? false,
    [activeClientId, item.children, pathname]
  );
  const isExtraActive = useMemo(
    () => item.activeHrefs?.some((href) => {
      const resolved = resolveClientHref(href, activeClientId);
      return pathname === resolved || pathname.startsWith(`${resolved}/`);
    }) ?? false,
    [activeClientId, item.activeHrefs, pathname]
  );
  const isActive = pathname === resolvedHref || isChildActive || isExtraActive;
  const [open, setOpen] = useState(isActive);

  if (hasChildren) {
    return (
      <SidebarMenuItem>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton isActive={isActive}>
              {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
              <span className="flex-1 text-left group-data-[state=collapsed]/sidebar-wrapper:md:hidden">{item.title}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform group-data-[state=collapsed]/sidebar-wrapper:md:hidden", open && "rotate-180")} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children?.map((child) => {
                const childHref = resolveClientHref(child.href, activeClientId);
                const childActive = pathname === childHref;

                return (
                  <SidebarMenuSubItem key={child.title}>
                    <SidebarMenuSubButton asChild isActive={childActive}>
                      <Link href={childHref} prefetch={false} onClick={onNavigate}>{child.title}</Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={resolvedHref} prefetch={false} onClick={onNavigate}>
          {Icon ? <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-white/45")} /> : null}
          <span className="group-data-[state=collapsed]/sidebar-wrapper:md:hidden">{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
