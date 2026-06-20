import { mockClients } from "@/lib/mock-data";

export function getDefaultClientId() {
  if (typeof window !== "undefined") {
    const storedClientId = window.localStorage.getItem("herbads-active-client-id");
    if (storedClientId) return storedClientId;
  }

  return mockClients[0]?.id ?? "demo-client";
}

export function getActiveClientId(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)/);
  return match?.[1];
}

export function resolveClientHref(href: string, clientId?: string) {
  if (!href.includes("[clientId]")) return href;
  return href.replace("[clientId]", clientId ?? getDefaultClientId());
}

export function replaceClientInPath(pathname: string, nextClientId: string) {
  if (pathname.match(/^\/clients\/[^/]+/)) {
    return pathname.replace(/^\/clients\/[^/]+/, `/clients/${nextClientId}`);
  }

  if (pathname === "/clients" || pathname.startsWith("/clients/")) {
    return `/clients/${nextClientId}`;
  }

  return `/clients/${nextClientId}`;
}

export function getPageTitle(pathname: string) {
  if (pathname.startsWith("/clients") && pathname.includes("/creatives/landingpages")) return "Landingpages";
  if (pathname.startsWith("/clients") && pathname.includes("/learning")) return "Creative Learning";
  if (pathname.startsWith("/clients") && pathname.includes("/iterations")) return "Iterations";
  if (pathname.startsWith("/clients") && pathname.includes("/creatives")) return "Creatives";
  if (pathname.startsWith("/clients") && pathname.includes("/angles")) return "Creative Angles";
  if (pathname.startsWith("/clients") && pathname.includes("/ideas")) return "Ad Ideas";
  if (pathname.startsWith("/clients") && pathname.includes("/competitors")) return "Competitors";
  if (pathname.startsWith("/clients") && pathname.includes("/meta/settings")) return "META Ads Settings";
  if (pathname.startsWith("/clients") && pathname.includes("/knowledge")) return "Wissensdatenbank";
  if (pathname.startsWith("/clients") && pathname.includes("/settings")) return "Kundeneinstellungen";
  if (pathname.startsWith("/clients/")) return "Kunden-Dashboard";
  if (pathname === "/clients") return "Kunden";
  if (pathname.startsWith("/analysis")) return "META Ads";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/settings")) return "Einstellungen";
  return "Dashboard";
}
