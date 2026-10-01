import "server-only";
import { createHash } from "node:crypto";
import { JWT } from "google-auth-library";

type DriveAuthMode = "api_key" | "service_account";
let cachedClient: { fingerprint: string; client: JWT } | undefined;

export function getDriveAuthMode(clientId?: string): DriveAuthMode {
  const mode = process.env.GOOGLE_DRIVE_AUTH_MODE?.trim() || "api_key";
  if (mode !== "api_key" && mode !== "service_account")
    throw new Error("GOOGLE_DRIVE_AUTH_MODE muss api_key oder service_account sein.");
  if (mode === "api_key") return mode;
  const clients = (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_CLIENT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (clients.length && !clientId) throw new Error("Kundenzuordnung fuer die Drive-Anbindung fehlt.");
  return clients.length && !clients.includes(clientId!) ? "api_key" : "service_account";
}

export function hasDriveCredentials(clientId?: string) {
  try {
    return Boolean(
      (getDriveAuthMode(clientId) === "service_account"
        ? process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
        : process.env.GOOGLE_DRIVE_API_KEY
      )?.trim()
    );
  } catch {
    return false;
  }
}

function serviceAccountClient() {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON fehlt. Bitte das Drive-Dienstkonto konfigurieren.");
  const fingerprint = createHash("sha256").update(raw).digest("hex");
  if (cachedClient?.fingerprint === fingerprint) return cachedClient.client;
  try {
    const key = JSON.parse(raw);
    if (
      key?.type !== "service_account" ||
      typeof key.client_email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(key.client_email) ||
      typeof key.private_key !== "string" ||
      !key.private_key.startsWith("-----BEGIN PRIVATE KEY-----")
    )
      throw new Error();
    // Only these fields are accepted: no delegated user, custom token URL or external credential source.
    const client = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      transporterOptions: { timeout: 10_000, retryConfig: { retry: 0 } }
    });
    cachedClient = { fingerprint, client };
    return client;
  } catch {
    throw new Error("Die JSON-Konfiguration des Drive-Dienstkontos ist ungueltig.");
  }
}

export async function driveRequest(fileId?: string, clientId?: string) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files${fileId ? `/${encodeURIComponent(fileId)}` : ""}`);
  url.searchParams.set("supportsAllDrives", "true");
  const headers: Record<string, string> = {};
  if (getDriveAuthMode(clientId) === "api_key") {
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
    if (!apiKey) throw new Error("GOOGLE_DRIVE_API_KEY fehlt. Bitte die Drive-Anbindung konfigurieren.");
    url.searchParams.set("key", apiKey);
  } else {
    const client = serviceAccountClient();
    try {
      const { token } = await client.getAccessToken();
      if (!token) throw new Error();
      headers.Authorization = `Bearer ${token}`;
    } catch {
      // SDK errors may contain the signed assertion or private key in their request configuration.
      throw new Error("Drive-Dienstkonto konnte nicht angemeldet werden. Bitte Schluessel und Dienstkonto pruefen.");
    }
  }
  return { url, headers };
}

export async function fetchDriveMetadata<T>(url: URL, headers: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error("Drive-Ordner oder Dateien konnten nicht geladen werden. Bitte spaeter erneut versuchen.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const hint =
      response.status === 403 || response.status === 404
        ? "Bitte Drive API und Ordnerfreigabe fuer die konfigurierte Drive-Anbindung pruefen."
        : "Bitte die Drive-Anbindung pruefen oder spaeter erneut versuchen.";
    throw new Error(`Drive-Ordner oder Dateien konnten nicht geladen werden (HTTP ${response.status}). ${hint}`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Drive-Ordner oder Dateien konnten nicht geladen werden. Bitte spaeter erneut versuchen.");
  }
}
