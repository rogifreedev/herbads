export type MetaApiFailure = {
  endpoint: string;
  message: string;
  status: number | null;
  code: number | null;
  subcode: number | null;
  traceId: string | null;
  isTransient: boolean;
};

export class MetaApiRequestError extends Error {
  readonly details: MetaApiFailure;
  readonly retryable: boolean;

  constructor(details: MetaApiFailure) {
    super(formatMetaApiFailure(details));
    this.name = "MetaApiRequestError";
    this.details = details;
    this.retryable = isRetryableMetaApiFailure(details);
  }
}

export function metaRequestLabel(pathOrUrl: string) {
  try {
    const url = pathOrUrl.startsWith("http")
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl, "https://graph.facebook.com");
    const breakdown = url.searchParams.get("breakdowns");
    return `${url.pathname}${breakdown ? `?breakdowns=${breakdown}` : ""}`;
  } catch {
    return pathOrUrl.split("?")[0] || "Meta API";
  }
}

export function isRetryableMetaApiFailure(details: MetaApiFailure) {
  if (details.isTransient) return true;
  if (details.status === 408 || details.status === 425 || details.status === 429) return true;
  if (details.status !== null && details.status >= 500) return true;
  if (details.code === 1 || details.code === 2) return true;
  return /unexpected error|please retry|temporar(?:y|ily)|service unavailable|connection|network|fetch failed/i.test(details.message);
}

export function formatMetaApiFailure(details: MetaApiFailure) {
  const context = [
    details.status !== null ? `HTTP ${details.status}` : null,
    details.code !== null ? `Code ${details.code}` : null,
    details.subcode !== null ? `Subcode ${details.subcode}` : null,
    details.traceId ? `Trace ${details.traceId}` : null
  ].filter(Boolean);
  return `Meta API ${details.endpoint}: ${details.message}${context.length > 0 ? ` (${context.join(", ")})` : ""}`;
}
