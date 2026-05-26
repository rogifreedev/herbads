export const APP_SESSION_COOKIE_NAME = "herbads-session";
export const APP_SESSION_MAX_AGE = 7 * 24 * 60 * 60;

type AppSessionPayload = {
  email: string;
  exp: number;
};

let signingKeyPromise: Promise<CryptoKey> | null = null;

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET ?? process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("APP_SESSION_SECRET, CRON_SECRET oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  return secret;
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeString(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeString(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getSigningKey() {
  signingKeyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return signingKeyPromise;
}

async function signPayload(payload: string) {
  const signature = await crypto.subtle.sign("HMAC", await getSigningKey(), new TextEncoder().encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function verifyPayload(payload: string, signature: string) {
  const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const signatureBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return crypto.subtle.verify("HMAC", await getSigningKey(), signatureBytes, new TextEncoder().encode(payload));
}

export async function createAppSessionCookie(email: string) {
  const payload: AppSessionPayload = {
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + APP_SESSION_MAX_AGE
  };
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifyAppSessionCookie(value: string | undefined) {
  if (!value) return null;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;

  const valid = await verifyPayload(encodedPayload, signature).catch(() => false);
  if (!valid) return null;

  try {
    const payload = JSON.parse(base64UrlDecodeString(encodedPayload)) as AppSessionPayload;
    if (!payload.email || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
