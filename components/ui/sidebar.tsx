"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
}

export function SidebarProvider({ defaultOpen = true, children, className, style }: React.HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);

  const toggleSidebar = React.useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setOpen((value) => !value);
      return;
    }
    setOpenMobile((value) => !value);
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, openMobile, setOpenMobile, toggleSidebar }}>
      <div data-sidebar-wrapper="" data-state={open ? "expanded" : "collapsed"} className={cn("group/sidebar-wrapper flex min-h-screen w-full bg-background text-foreground", className)} style={style}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children, className, variant = "sidebar", collapsible = "icon" }: React.HTMLAttributes<HTMLDivElement> & { variant?: "sidebar" | "inset" | "floating"; collapsible?: "icon" | "offcanvas" | "none" }) {
  const { open, openMobile, setOpenMobile } = useSidebar();
  const desktopWidth = open || collapsible === "none" ? "md:w-[18rem]" : "md:w-[4.75rem]";

  return (
    <>
      <aside
        data-sidebar="sidebar"
        data-state={open ? "expanded" : "collapsed"}
        data-variant={variant}
        className={cn("fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex", desktopWidth, className)}
      >
        {children}
      </aside>
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="left" className="w-[var(--sidebar-width-mobile)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-w-0 flex-1 flex-col md:pl-[18rem] group-data-[state=collapsed]/sidebar-wrapper:md:pl-[4.75rem]", className)} {...props} />;
}

export function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button variant="ghost" size="icon" className={cn("h-9 w-9 text-white/70 hover:text-white", className)} onClick={toggleSidebar} {...props}>
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Sidebar umschalten</span>
    </Button>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-4", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-sidebar-border p-4", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 text-xs font-medium uppercase tracking-[0.16em] text-sidebar-foreground/45", className)} {...props} />;
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("space-y-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("relative", className)} {...props} />;
}

export function SidebarMenuButton({ className, isActive, asChild = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-active={isActive}
      className={cn(
        "flex min-h-9 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary/15 data-[active=true]:text-white group-data-[state=collapsed]/sidebar-wrapper:md:justify-center group-data-[state=collapsed]/sidebar-wrapper:md:px-2",
        className
      )}
      {...props}
    />
  );
}

export function SidebarMenuSub({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("ml-5 mt-1 space-y-1 border-l border-sidebar-border pl-3 group-data-[state=collapsed]/sidebar-wrapper:md:hidden", className)} {...props} />;
}

export function SidebarMenuSubItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("relative", className)} {...props} />;
}

export function SidebarMenuSubButton({ className, isActive, asChild = false, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { isActive?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot : "a";
  return <Comp data-active={isActive} className={cn("block rounded-lg px-3 py-2 text-sm text-sidebar-foreground/55 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary", className)} {...props} />;
}

export function SidebarRail({ className, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar } = useSidebar();
  return <button type="button" aria-label="Sidebar umschalten" className={cn("absolute inset-y-0 -right-3 hidden w-6 cursor-col-resize md:block", className)} onClick={toggleSidebar} {...props} />;
}
