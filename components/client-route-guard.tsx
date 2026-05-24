"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getActiveClientId, replaceClientInPath } from "@/lib/routes";

type ClientOption = {
  id: string;
};

export function ClientRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let ignore = false;

    async function validateClientRoute() {
      const response = await fetch("/api/clients", { cache: "no-store" });
      const result = await response.json();
      const clients = Array.isArray(result.clients) ? (result.clients as ClientOption[]) : [];
      const firstClientId = clients[0]?.id;

      if (!firstClientId || ignore) return;

      window.localStorage.setItem("herbads-active-client-id", firstClientId);

      const activeClientId = getActiveClientId(pathname);
      if (!activeClientId) return;

      if (!clients.some((client) => client.id === activeClientId)) {
        router.replace(replaceClientInPath(pathname, firstClientId));
      } else {
        window.localStorage.setItem("herbads-active-client-id", activeClientId);
      }
    }

    validateClientRoute().catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [pathname, router]);

  return null;
}
