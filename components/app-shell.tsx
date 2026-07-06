import { SidebarNav } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <Topbar />
        <main className="mx-auto min-h-[calc(100vh-var(--topbar-height))] w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
