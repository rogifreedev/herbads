import "server-only";

const RETRYABLE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError"]);
const NON_RETRYABLE_REASONS = new Set([
  "downloadQuotaExceeded",
  "dailyLimitExceeded",
  "insufficientFilePermissions",
  "appNotAuthorizedToFile",
  "domainPolicy",
  "download_restricted_for_revision",
  "cannotDownloadAbusiveFile",
  "fileNotDownloadable",
  "notFound",
  "authError",
  "CREDENTIALS_MISSING",
  "forbidden",
  "API_KEY_INVALID",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_SERVICE_BLOCKED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
]);

type DriveFailure = { reason: string | null; format: "JSON" | "HTML" | "Text" | "leer" | "zu gross" | "unlesbar" };

async function errorDetails(response: Response, apiKey: string | null): Promise<DriveFailure> {
  const reader = response.body?.getReader();
  if (!reader) return { reason: null, format: "leer" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024) return { reason: null, format: "zu gross" };
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) return { reason: null, format: "leer" };
    if (response.headers.get("Content-Type")?.includes("text/html") || /^<(?:!doctype|html)\b/i.test(text))
      return { reason: null, format: "HTML" };
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { reason: null, format: "Text" };
    }
    const reasons = [
      ...(Array.isArray(data?.error?.errors) ? data.error.errors : []),
      ...(Array.isArray(data?.error?.details) ? data.error.details : [])
    ];
    const codes: string[] = reasons
      .map((item: { reason?: unknown } | null) => item?.reason)
      .filter(
        (reason: unknown): reason is string =>
          typeof reason === "string" &&
          /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(reason) &&
          (!apiKey || !reason.includes(apiKey))
      );
    // Retain new Google reason codes, but never raw messages, URLs or request credentials.
    return { reason: codes.find((reason) => NON_RETRYABLE_REASONS.has(reason)) ?? codes[0] ?? null, format: "JSON" };
  } catch {
    return { reason: null, format: "unlesbar" };
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function downloadError(name: string, status: number, { reason, format }: DriveFailure) {
  let hint =
    "Google Drive hat keinen eindeutig zugeordneten Fehlergrund geliefert. Bitte spaeter fortsetzen; eine fehlende Dateifreigabe ist damit nicht bestaetigt.";
  if (reason === "downloadQuotaExceeded")
    hint = "Das Drive-Download-Limit dieser Datei ist erreicht. Bitte spaeter fortsetzen.";
  else if (reason === "dailyLimitExceeded")
    hint = "Das Tageslimit der Drive-Anbindung ist erreicht. Bitte das API-Kontingent pruefen oder spaeter fortsetzen.";
  else if (status === 429 || (reason && RETRYABLE_REASONS.has(reason)) || status >= 500)
    hint = "Google Drive ist voruebergehend nicht verfuegbar oder begrenzt Anfragen. Bitte spaeter fortsetzen.";
  else if (status === 404)
    hint = "Die Datei ist nicht mehr erreichbar. Bitte pruefen, ob sie noch existiert und freigegeben ist.";
  else if (
    status === 401 ||
    reason?.startsWith("API_KEY_") ||
    reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
    reason === "CREDENTIALS_MISSING"
  )
    hint = "Die Drive-Anbindung ist nicht ausreichend autorisiert. Bitte ihre Zugangsdaten und Berechtigungen pruefen.";
  else if (reason && NON_RETRYABLE_REASONS.has(reason))
    hint = "Bitte die Datei und ihre Download-Freigabe in Google Drive pruefen.";
  return new Error(
    `Drive-Download fehlgeschlagen: ${name} (HTTP ${status}, ${reason ?? `Fehlerantwort: ${format}`}). ${hint}`
  );
}

function retryDelay(attempt: number, retryAfter: string | null, unclassified: boolean) {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
  return Math.max(
    (unclassified ? 2000 : 1000) * 2 ** attempt + Math.floor(Math.random() * 250),
    Number.isFinite(requested) ? requested : 0
  );
}

export async function fetchDriveDownload(url: URL, name: string, range: string, timeoutMs = 30_000) {
  // Only retry GET responses before handing any bytes to the caller. All attempts share one time budget.
  const deadline = Date.now() + timeoutMs;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    let failure: Error;
    let retryable = true;
    let unclassified = false;
    try {
      response = await fetch(url, { headers: { Range: range }, cache: "no-store", signal });
    } catch (cause) {
      failure = new Error(`Drive-Download unterbrochen: ${name}. Bitte spaeter fortsetzen.`, { cause });
    }
    if (response) {
      if (response.ok) return response;
      const details = await errorDetails(response, url.searchParams.get("key"));
      failure = downloadError(name, response.status, details);
      const { reason } = details;
      unclassified =
        response.status === 403 &&
        (reason === null || (!RETRYABLE_REASONS.has(reason) && !NON_RETRYABLE_REASONS.has(reason)));
      retryable =
        [429, 500, 502, 503, 504].includes(response.status) ||
        (response.status === 403 && (unclassified || (reason !== null && RETRYABLE_REASONS.has(reason))));
    }
    const waitMs = retryDelay(attempt, response?.headers.get("Retry-After") ?? null, unclassified);
    if (!retryable || attempt >= 2 || signal.aborted || Date.now() + waitMs + 1000 >= deadline) {
      if (attempt > 0) failure!.message += ` Nach ${attempt + 1} Download-Versuchen angehalten.`;
      throw failure!;
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
