import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_SESSION_COOKIE_NAME, createAppSessionCookie, verifyAppSessionCookie } from "@/lib/auth-session";
import { updateSession } from "@/lib/supabase/middleware";

const origin = "https://herbads.test";
const authCookieName = "sb-test-auth-token";
const user = { id: "test-user", email: "tester@herb-media.com" };

function session(expiresIn: number, email = user.email) {
  return {
    access_token: expiresIn > 0 ? "fresh-access-token" : "expired-access-token",
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: { ...user, email }
  };
}

function authCookies(expiresIn: number, chunked = false, email = user.email): Record<string, string> {
  const value = `base64-${Buffer.from(JSON.stringify(session(expiresIn, email))).toString("base64url")}`;
  if (!chunked) return { [authCookieName]: value };
  const midpoint = Math.floor(value.length / 2);
  return { [`${authCookieName}.0`]: value.slice(0, midpoint), [`${authCookieName}.1`]: value.slice(midpoint) };
}

function request(path: string, cookies: Record<string, string> = {}) {
  return new NextRequest(new URL(path, origin), {
    headers: { cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ") }
  });
}

function browserCookies(previous: Record<string, string>, response: NextResponse) {
  const cookies = { ...previous };
  response.cookies.getAll().forEach(({ name, value, maxAge }) => {
    if (maxAge === 0) delete cookies[name];
    else cookies[name] = value;
  });
  return cookies;
}

describe("auth middleware", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
    vi.stubEnv("APP_SESSION_SECRET", "test-only-signing-secret");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/token") return Response.json(session(3600));
      if (url.pathname === "/auth/v1/user") return Response.json(user);
      throw new Error(`Unexpected auth request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([false, true])("refreshes an expired session and forwards cookies to the browser and page (chunked: %s)", async (chunked) => {
    const incomingCookies = authCookies(-3600, chunked);
    const incoming = request("/dashboard", incomingCookies);
    const response = await updateSession(incoming);

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/token?grant_type=refresh_token"))).toBe(true);
    const refreshed = response.cookies.get(authCookieName);
    expect(refreshed?.value).toBeTruthy();
    expect(refreshed?.path).toBe("/");
    expect(incoming.cookies.get(authCookieName)?.value).toBe(refreshed?.value);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(`${authCookieName}=${refreshed?.value}`);
    expect(await verifyAppSessionCookie(response.cookies.get(APP_SESSION_COOKIE_NAME)?.value)).toMatchObject({ email: user.email });
    expect(response.headers.get("cache-control")).toContain("no-store");

    if (chunked) {
      expect(response.cookies.get(`${authCookieName}.0`)?.maxAge).toBe(0);
      expect(response.cookies.get(`${authCookieName}.1`)?.maxAge).toBe(0);
    }

    const nextResponse = await updateSession(request("/dashboard", browserCookies(incomingCookies, response)));
    expect(nextResponse.headers.get("location")).toBeNull();
  });

  it("persists the refreshed session on the login redirect so the dashboard accepts it", async () => {
    const incomingCookies = authCookies(-3600);
    const response = await updateSession(request("/login", incomingCookies));

    expect(response.headers.get("location")).toBe(`${origin}/dashboard`);
    expect(response.cookies.get(authCookieName)?.value).toBeTruthy();
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });

    const nextResponse = await updateSession(request("/dashboard", browserCookies(incomingCookies, response)));
    expect(nextResponse.headers.get("location")).toBeNull();
  });

  it("clears rejected refresh cookies on a redirect and stops at the login page", async () => {
    fetchMock.mockImplementation(async () => Response.json({ code: "refresh_token_not_found", message: "Invalid Refresh Token" }, { status: 400 }));
    const incomingCookies = authCookies(-3600, true);
    const response = await updateSession(request("/dashboard?range=30", incomingCookies));

    expect(response.headers.get("location")).toBe(`${origin}/login?next=%2Fdashboard%3Frange%3D30`);
    expect(response.cookies.get(`${authCookieName}.0`)?.maxAge).toBe(0);
    expect(response.cookies.get(`${authCookieName}.1`)?.maxAge).toBe(0);
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)?.value).toBeFalsy();

    const nextResponse = await updateSession(request(response.headers.get("location")!, browserCookies(incomingCookies, response)));
    expect(nextResponse.headers.get("location")).toBeNull();
  });

  it("leaves the login page accessible during an auth service error", async () => {
    fetchMock.mockImplementation(async () => Response.json({ message: "Temporarily unavailable" }, { status: 503 }));
    const response = await updateSession(request("/login", authCookies(3600)));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)?.value).toBeFalsy();
  });

  it("redirects an anonymous visitor once, preserving the original destination", async () => {
    const response = await updateSession(request("/clients?status=active"));
    expect(response.headers.get("location")).toBe(`${origin}/login?next=%2Fclients%3Fstatus%3Dactive`);

    const loginResponse = await updateSession(request(response.headers.get("location")!));
    expect(loginResponse.headers.get("location")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns JSON for an unauthenticated API call", async () => {
    const response = await updateSession(request("/api/clients"));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toHaveProperty("error");
  });

  it("rejects a foreign domain even if the cookie claims an allowed email", async () => {
    fetchMock.mockImplementation(async () => Response.json({ ...user, email: "tester@example.com" }));
    const response = await updateSession(request("/api/clients", authCookies(3600)));
    expect(response.status).toBe(403);
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)?.value).toBeFalsy();

    const loginResponse = await updateSession(request("/login", authCookies(3600)));
    expect(loginResponse.headers.get("location")).toBeNull();
  });

  it("accepts a verified email regardless of letter case", async () => {
    fetchMock.mockImplementation(async () => Response.json({ ...user, email: "Tester@HERB-MEDIA.COM" }));
    const response = await updateSession(request("/dashboard", authCookies(3600)));
    expect(response.headers.get("location")).toBeNull();
    expect(await verifyAppSessionCookie(response.cookies.get(APP_SESSION_COOKIE_NAME)?.value)).toMatchObject({ email: user.email });
  });

  it.each(["/dashboard", "/login"])("uses the signed app session consistently on %s without an auth request", async (path) => {
    const appCookie = await createAppSessionCookie(user.email);
    const response = await updateSession(request(path, { [APP_SESSION_COOKIE_NAME]: appCookie }));

    expect(response.headers.get("location")).toBe(path === "/login" ? `${origin}/dashboard` : null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not accept a tampered app cookie", async () => {
    const response = await updateSession(request("/dashboard", { [APP_SESSION_COOKIE_NAME]: "tampered.invalid" }));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it.each(["/auth/google", "/auth/callback?code=test", "/auth/finish", "/auth/logout", "/api/cron/meta-sync"])("leaves %s to its route handler", async (path) => {
    const response = await updateSession(request(path));
    expect(response.headers.get("location")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
