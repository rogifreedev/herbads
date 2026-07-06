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

/** Returns a full message key path (e.g. "nav.dashboard") for use with a root-namespace translator. */
export function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/clients") && pathname.includes("/creatives/landingpages")) return "nav.landingpages";
  if (pathname.startsWith("/clients") && pathname.includes("/creatives/batches")) return "nav.batchPerformance";
  if (pathname.startsWith("/clients") && pathname.includes("/learning")) return "nav.creativeLearning";
  if (pathname.startsWith("/clients") && pathname.includes("/competitors/iterations")) return "nav.competitorIterations";
  if (pathname.startsWith("/clients") && pathname.includes("/iterations")) return "nav.iterations";
  if (pathname.startsWith("/clients") && pathname.includes("/prediction-tool/history")) return "nav.predictionHistory";
  if (pathname.startsWith("/clients") && pathname.includes("/prediction-tool")) return "nav.predictionTool";
  if (pathname.startsWith("/clients") && pathname.includes("/batches/settings")) return "nav.batchSettings";
  if (pathname.startsWith("/clients") && pathname.includes("/batches")) return "nav.batches";
  if (pathname.startsWith("/clients") && pathname.includes("/adsets/")) return "nav.adSet";
  if (pathname.startsWith("/clients") && pathname.includes("/creatives")) return "nav.creatives";
  if (pathname.startsWith("/clients") && pathname.includes("/angles")) return "nav.creativeAngles";
  if (pathname.startsWith("/clients") && pathname.includes("/ideas")) return "nav.adIdeas";
  if (pathname.startsWith("/clients") && pathname.includes("/competitors")) return "nav.competitors";
  if (pathname.startsWith("/clients") && pathname.includes("/meta/settings")) return "nav.metaAdsSettings";
  if (pathname.startsWith("/clients") && pathname.includes("/knowledge")) return "nav.knowledgeBase";
  if (pathname.startsWith("/clients") && pathname.includes("/settings")) return "nav.clientSettings";
  if (pathname.startsWith("/clients/")) return "nav.clientDashboard";
  if (pathname === "/clients") return "nav.clients";
  if (pathname.startsWith("/analysis")) return "nav.metaAds";
  if (pathname.startsWith("/reports")) return "nav.reports";
  if (pathname.startsWith("/settings")) return "nav.settings";
  return "nav.dashboard";
}
