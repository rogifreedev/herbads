import "server-only";

const RETRYABLE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError"]);
const REASONS = new Set([
  ...RETRYABLE_REASONS,
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
  "forbidden",
  "API_KEY_INVALID",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_SERVICE_BLOCKED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
]);

async function errorReason(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024) return null;
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const reasons = [
      ...(Array.isArray(data?.error?.errors) ? data.error.errors : []),
      ...(Array.isArray(data?.error?.details) ? data.error.details : [])
    ];
    return (
      reasons
        .map((item: { reason?: unknown } | null) => item?.reason)
        .find((reason: unknown): reason is string => typeof reason === "string" && REASONS.has(reason)) ?? null
    );
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function downloadError(name: string, status: number, reason: string | null) {
  let hint = "Bitte die Datei und ihre Download-Freigabe in Google Drive pruefen.";
  if (reason === "downloadQuotaExceeded")
    hint = "Das Drive-Download-Limit dieser Datei ist erreicht. Bitte spaeter fortsetzen.";
  else if (reason === "dailyLimitExceeded")
    hint = "Das Tageslimit der Drive-Anbindung ist erreicht. Bitte das API-Kontingent pruefen oder spaeter fortsetzen.";
  else if (status === 429 || (reason && RETRYABLE_REASONS.has(reason)) || status >= 500)
    hint = "Google Drive ist voruebergehend nicht verfuegbar oder begrenzt Anfragen. Bitte spaeter fortsetzen.";
  else if (status === 404)
    hint = "Die Datei ist nicht mehr erreichbar. Bitte pruefen, ob sie noch existiert und freigegeben ist.";
  else if (status === 401 || reason?.startsWith("API_KEY_") || reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT")
    hint = "Die Drive-Anbindung ist nicht ausreichend autorisiert. Bitte ihre Zugangsdaten und Berechtigungen pruefen.";
  return new Error(`Drive-Download fehlgeschlagen: ${name} (HTTP ${status}${reason ? `, ${reason}` : ""}). ${hint}`);
}

function retryDelay(attempt: number, retryAfter: string | null) {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
  return Math.max(1000 * 2 ** attempt + Math.floor(Math.random() * 250), Number.isFinite(requested) ? requested : 0);
}

export async function fetchDriveDownload(url: URL, name: string, range: string, timeoutMs = 30_000) {
  // Only retry GET responses before handing any bytes to the caller. All attempts share one time budget.
  const deadline = Date.now() + timeoutMs;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    let failure: Error;
    let retryable = true;
    try {
      response = await fetch(url, { headers: { Range: range }, cache: "no-store", signal });
    } catch (cause) {
      failure = new Error(`Drive-Download unterbrochen: ${name}. Bitte spaeter fortsetzen.`, { cause });
    }
    if (response) {
      if (response.ok) return response;
      const reason = await errorReason(response);
      failure = downloadError(name, response.status, reason);
      retryable =
        [429, 500, 502, 503, 504].includes(response.status) ||
        (response.status === 403 && reason !== null && RETRYABLE_REASONS.has(reason));
    }
    const waitMs = retryDelay(attempt, response?.headers.get("Retry-After") ?? null);
    if (!retryable || attempt >= 2 || signal.aborted || Date.now() + waitMs + 1000 >= deadline) throw failure!;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
