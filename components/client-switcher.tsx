"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { mockClients } from "@/lib/mock-data";
import { getActiveClientId, replaceClientInPath } from "@/lib/routes";

type ClientOption = {
  id: string;
  name: string;
  status: string;
  adAccountId: string | null;
  source: "supabase" | "mock";
};

const fallbackClients: ClientOption[] = mockClients.map((client) => ({
  id: client.id,
  name: client.name,
  status: client.status,
  adAccountId: client.adAccountId,
  source: "mock"
}));

export function ClientSwitcher() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>(fallbackClients);
  const activeClientId = getActiveClientId(pathname) ?? clients[0]?.id;
  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) ?? clients[0],
    [activeClientId, clients]
  );

  useEffect(() => {
    let ignore = false;

    async function loadClients() {
      const response = await fetch("/api/clients", { cache: "no-store" });
      const result = await response.json();

      if (!ignore && Array.isArray(result.clients)) {
        setClients(result.clients);
      }
    }

    loadClients().catch(() => {
      if (!ignore) setClients(fallbackClients);
    });
    window.addEventListener("herbads-clients-changed", loadClients);

    return () => {
      ignore = true;
      window.removeEventListener("herbads-clients-changed", loadClients);
    };
  }, []);

  useEffect(() => {
    const firstClient = clients[0];
    const activeClient = clients.find((client) => client.id === getActiveClientId(pathname));

    if (activeClient) {
      window.localStorage.setItem("herbads-active-client-id", activeClient.id);
    } else if (firstClient) {
      window.localStorage.setItem("herbads-active-client-id", firstClient.id);
    }
  }, [clients, pathname]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="hidden min-w-[220px] justify-between border-herb-border bg-card text-foreground shadow-[var(--shadow-xs)] hover:bg-secondary sm:inline-flex">
          <span className="flex min-w-0 items-center gap-2 truncate">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {activeClient?.name.slice(0, 1) ?? "K"}
            </span>
            <span className="truncate text-left leading-tight">
              <span className="block truncate">{activeClient?.name ?? t("selectClient")}</span>
              {activeClient?.adAccountId ? <span className="block truncate font-mono text-[10px] text-muted-foreground">{activeClient.adAccountId}</span> : null}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("switchClient")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {clients.length === 0 ? (
          <DropdownMenuItem disabled>{t("noClientCreated")}</DropdownMenuItem>
        ) : null}
        {clients.map((client) => (
          <DropdownMenuItem
            key={client.id}
            onClick={() => router.push(replaceClientInPath(pathname, client.id))}
            className="gap-2"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 font-heading text-xs text-primary">
              {client.name.slice(0, 1)}
            </span>
            <span className="flex-1 truncate">{client.name}</span>
            {client.id === activeClientId ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
