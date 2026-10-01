import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feed } from "./batch-launch-fixtures";

const mocks = vi.hoisted(() => ({ token: vi.fn(), options: vi.fn() }));
vi.mock("google-auth-library", () => ({
  JWT: class {
    constructor(options: unknown) {
      mocks.options(options);
    }
    getAccessToken = mocks.token;
  }
}));

const key = {
  type: "service_account",
  client_email: "reader@project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nTEST-ONLY\n-----END PRIVATE KEY-----"
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.token.mockReset().mockResolvedValue({ token: "secret-bearer" });
  vi.stubEnv("GOOGLE_DRIVE_AUTH_MODE", "service_account");
  vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_CLIENT_IDS", "pilot");
  vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", JSON.stringify(key));
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "backup-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("server-only Drive credentials", () => {
  it("uses a read-only service account for the pilot and retains API-key routing for other clients", async () => {
    const { driveRequest } = await import("@/lib/google-drive-auth");
    const request = await driveRequest("file/id", "pilot");
    expect(request.url.pathname).toBe("/drive/v3/files/file%2Fid");
    expect(request.url.searchParams.has("key")).toBe(false);
    expect(request.headers).toEqual({ Authorization: "Bearer secret-bearer" });
    expect(mocks.options).toHaveBeenCalledWith({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      transporterOptions: { timeout: 10_000, retryConfig: { retry: 0 } }
    });
    const other = await driveRequest("file", "other");
    expect(other.url.searchParams.get("key")).toBe("backup-key");
    expect(other.headers).toEqual({});
    expect(mocks.token).toHaveBeenCalledTimes(1);
  });
  it("supports explicit rollback without parsing or using the service-account key", async () => {
    vi.stubEnv("GOOGLE_DRIVE_AUTH_MODE", "api_key");
    vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "invalid");
    const { driveRequest } = await import("@/lib/google-drive-auth");
    expect((await driveRequest("file", "pilot")).url.searchParams.get("key")).toBe("backup-key");
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("defaults to existing API-key access when no mode was configured", async () => {
    vi.stubEnv("GOOGLE_DRIVE_AUTH_MODE", "");
    const { driveRequest } = await import("@/lib/google-drive-auth");
    expect((await driveRequest()).url.searchParams.get("key")).toBe("backup-key");
  });
  it("requires client context for scoped rollout and permits global service-account mode explicitly", async () => {
    const { driveRequest } = await import("@/lib/google-drive-auth");
    await expect(driveRequest()).rejects.toThrow(/Kundenzuordnung/);
    vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_CLIENT_IDS", "");
    expect((await driveRequest()).headers.Authorization).toBe("Bearer secret-bearer");
  });
  it("never silently falls back for invalid mode, absent credentials or invalid JSON", async () => {
    const { driveRequest, hasDriveCredentials } = await import("@/lib/google-drive-auth");
    vi.stubEnv("GOOGLE_DRIVE_AUTH_MODE", "typo");
    await expect(driveRequest("file", "pilot")).rejects.toThrow(/AUTH_MODE/);
    expect(hasDriveCredentials("pilot")).toBe(false);
    vi.stubEnv("GOOGLE_DRIVE_AUTH_MODE", "service_account");
    vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "");
    await expect(driveRequest("file", "pilot")).rejects.toThrow(/JSON fehlt/);
    expect(hasDriveCredentials("pilot")).toBe(false);
    vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "secret-bearer-invalid");
    await expect(driveRequest("file", "pilot")).rejects.toThrow(/Konfiguration.*ungueltig/);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...key, type: "authorized_user" },
    { ...key, private_key: null },
    { ...key, client_email: "bad" }
  ])("rejects unsupported or malformed credentials without echoing them: %#", async (value) => {
    vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", JSON.stringify(value));
    const { driveRequest } = await import("@/lib/google-drive-auth");
    await expect(driveRequest("file", "pilot")).rejects.toThrow(/Konfiguration.*ungueltig/);
    expect(mocks.options).not.toHaveBeenCalled();
  });
  it("reuses the SDK token cache, recreates it on rotation, and ignores external endpoints and delegated users", async () => {
    vi.stubEnv(
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({ ...key, token_uri: "https://invalid.test", subject: "admin@example.com" })
    );
    const { driveRequest } = await import("@/lib/google-drive-auth");
    await driveRequest("one", "pilot");
    await driveRequest("two", "pilot");
    expect(mocks.options).toHaveBeenCalledTimes(1);
    expect(mocks.options.mock.calls[0][0]).not.toHaveProperty("subject");
    expect(mocks.options.mock.calls[0][0]).not.toHaveProperty("token_uri");
    vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", JSON.stringify({ ...key, private_key: key.private_key + "\n" }));
    await driveRequest("three", "pilot");
    expect(mocks.options).toHaveBeenCalledTimes(2);
  });
  it.each([new Error("signed assertion and secret-bearer"), { config: { data: key.private_key } }])(
    "sanitizes SDK errors and never falls back to the API key",
    async (error) => {
      mocks.token.mockRejectedValue(error);
      const { driveRequest } = await import("@/lib/google-drive-auth");
      const failure = await driveRequest("file", "pilot").catch((value: Error) => value);
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain("Dienstkonto konnte nicht angemeldet");
      expect(JSON.stringify(failure)).not.toContain("secret-bearer");
      expect(failure).not.toHaveProperty("cause");
    }
  );
  it("rejects an empty token", async () => {
    mocks.token.mockResolvedValue({ token: null });
    const { driveRequest } = await import("@/lib/google-drive-auth");
    await expect(driveRequest("file", "pilot")).rejects.toThrow(/nicht angemeldet/);
  });
  it.each([401, 403, 404, 429, 500])("does not retry metadata HTTP %i with alternate credentials", async (status) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { message: key.private_key } }, { status }));
    vi.stubGlobal("fetch", fetch);
    const { listBatchMedia } = await import("@/lib/batch-launch-drive");
    await expect(listBatchMedia("root", "pilot")).rejects.toThrow(`HTTP ${status}`);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].searchParams.has("key")).toBe(false);
  });
  it("uses the same identity for listing, pagination, subfolders and size probes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ files: [], nextPageToken: "next" }))
      .mockResolvedValueOnce(
        Response.json({ files: [{ id: "sub", name: "sub", mimeType: "application/vnd.google-apps.folder" }] })
      )
      .mockResolvedValueOnce(Response.json({ files: [{ id: "image", name: "ad.png", mimeType: "image/png" }] }))
      .mockResolvedValueOnce(new Response("a", { status: 206, headers: { "Content-Range": "bytes 0-0/4" } }));
    vi.stubGlobal("fetch", fetch);
    const { listBatchMedia } = await import("@/lib/batch-launch-drive");
    expect((await listBatchMedia("root", "pilot")).files[0].size).toBe(4);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[1][0].searchParams.get("pageToken")).toBe("next");
    for (const [url, options] of fetch.mock.calls) {
      expect(url.searchParams.has("key")).toBe(false);
      expect(options.headers.Authorization).toBe("Bearer secret-bearer");
    }
    expect(fetch.mock.calls[3][1].headers.Range).toBe("bytes=0-0");
  });
  it("authenticates exact resumed video ranges and streamed image downloads", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("bc", { status: 206, headers: { "Content-Range": "bytes 1-2/4" } }))
      .mockResolvedValueOnce(new Response("abcd", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { downloadBatchImage, downloadBatchMedia } = await import("@/lib/batch-launch-drive");
    expect((await downloadBatchMedia({ ...feed, kind: "video" }, 1, 3, "pilot")).toString()).toBe("bc");
    const directory = await mkdtemp(join(tmpdir(), "drive-auth-test-"));
    try {
      const destination = join(directory, "image");
      await downloadBatchImage(feed, destination, "pilot");
      expect((await readFile(destination)).toString()).toBe("abcd");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    expect(fetch.mock.calls.map(([, options]) => options.headers)).toEqual([
      { Authorization: "Bearer secret-bearer", Range: "bytes=1-2" },
      { Authorization: "Bearer secret-bearer", Range: "bytes=0-3" }
    ]);
  });
});
