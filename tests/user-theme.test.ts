import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(), verify: vi.fn(), getUser: vi.fn(), from: vi.fn(), eq: vi.fn(), upsert: vi.fn(), result: vi.fn()
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth-session", () => ({ APP_SESSION_COOKIE_NAME: "herbads-session", verifyAppSessionCookie: mocks.verify }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ from: mocks.from }) }));
import { getInitialUserTheme, getThemeUserEmail } from "@/lib/user-theme";
import { PUT } from "@/app/api/user/theme/route";
import { isTheme } from "@/lib/theme";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "signed" }), getAll: () => [] });
  mocks.verify.mockResolvedValue({ email: "Tester@herb-media.com" });
  const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq, upsert: mocks.upsert, abortSignal: mocks.result };
  mocks.from.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.upsert.mockReturnValue(query);
  mocks.result.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: { theme: "dark" }, error: null }) });
});

const request = (body: unknown, origin = "https://herbads.vercel.app") => new Request("https://herbads.vercel.app/api/user/theme", {
  method: "PUT", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body)
});

describe("User themes", () => {
  it("loads a database preference only for the verified, normalized session identity", async () => {
    expect(await getInitialUserTheme()).toEqual({ theme: "dark", userKey: "tester@herb-media.com" });
    expect(mocks.eq).toHaveBeenCalledWith("user_email", "tester@herb-media.com");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("uses light for a new user without writing a preference", async () => {
    mocks.result.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
    expect((await getInitialUserTheme()).theme).toBe("light");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("keeps the app accessible on a database outage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.result.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "private" } }) });
    expect(await getInitialUserTheme()).toEqual({ theme: "light", userKey: "tester@herb-media.com" });
    expect(warn).toHaveBeenCalledWith("User theme could not be loaded.");
    warn.mockRestore();
  });
  it("does not swallow Next.js request-time rendering signals", async () => {
    const error = new Error("Request cookies require dynamic rendering");
    mocks.cookies.mockRejectedValue(error);
    await expect(getInitialUserTheme()).rejects.toBe(error);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not read user data for guests or users outside the allowed domain", async () => {
    for (const session of [null, { email: "test@outside.com" }]) {
      mocks.verify.mockResolvedValue(session);
      expect(await getInitialUserTheme()).toEqual({ theme: "light", userKey: "guest" });
    }
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("validates the Supabase session during the OAuth-to-app-cookie handoff", async () => {
    mocks.verify.mockResolvedValue(null);
    mocks.cookies.mockResolvedValue({ get: () => undefined, getAll: () => [{ name: "sb-project-auth-token.0", value: "token" }] });
    mocks.getUser.mockResolvedValue({ data: { user: { email: "Login@herb-media.com" } }, error: null });
    expect(await getThemeUserEmail()).toBe("login@herb-media.com");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    expect(await getThemeUserEmail()).toBeNull();
  });
  it.each(["light", "dark"])("persists %s using the session identity, with no shared cache", async (theme) => {
    const response = await PUT(request({ theme }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ theme });
    expect(mocks.upsert).toHaveBeenCalledWith({ user_email: "tester@herb-media.com", theme, updated_at: expect.any(String) }, { onConflict: "user_email" });
  });
  it.each([null, {}, { theme: "system" }, { theme: "dark", user_email: "other@herb-media.com" }, { theme: false }])("rejects invalid or ownership-changing payloads: %j", async (body) => {
    expect((await PUT(request(body))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("requires authentication and a same-origin request", async () => {
    expect((await PUT(request({ theme: "dark" }, "https://attacker.example"))).status).toBe(403);
    mocks.verify.mockResolvedValue(null);
    expect((await PUT(request({ theme: "dark" }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("checks the public host behind Next.js or a hosting proxy", async () => {
    const proxied = new Request("http://localhost:3000/api/user/theme", {
      method: "PUT", headers: { origin: "https://herbads.vercel.app", "x-forwarded-host": "herbads.vercel.app" },
      body: JSON.stringify({ theme: "dark" })
    });
    expect((await PUT(proxied)).status).toBe(200);
  });
  it("returns an actionable failure without leaking database details", async () => {
    mocks.result.mockResolvedValue({ error: { message: "secret details" } });
    const response = await PUT(request({ theme: "dark" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "saveError" });
  });
  it("accepts only supported binary themes", () => {
    expect(["dark", "light", "system", null, false].map(isTheme)).toEqual([true, true, false, false, false]);
  });
});
