import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDriveDownload } from "@/lib/batch-drive-download";

const url = new URL("https://www.googleapis.com/drive/v3/files/test?key=secret-api-key&alt=media");
const name = "Physio Hans Script 1 Hook3.mp4";
const range = "bytes=105906176-111149055";
const errorResponse = (status: number, reason: string, retryAfter?: string) =>
  Response.json(
    {
      error: { errors: [{ reason }], message: `Provider details: ${url}` }
    },
    { status, headers: retryAfter ? { "Retry-After": retryAfter } : {} }
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Drive download recovery", () => {
  it.each(["rateLimitExceeded", "userRateLimitExceeded"])(
    "retries a 403 %s at the exact same offset",
    async (reason) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(errorResponse(403, reason))
        .mockResolvedValueOnce(errorResponse(503, "backendError"))
        .mockResolvedValueOnce(new Response("media", { status: 206 }));
      vi.stubGlobal("fetch", fetch);
      const result = fetchDriveDownload(url, name, range);
      await vi.runAllTimersAsync();
      expect((await result).status).toBe(206);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(Date.now()).toBe(Date.parse("2026-10-01T08:00:03Z"));
      for (const [requestUrl, options] of fetch.mock.calls) {
        expect(requestUrl).toEqual(url);
        expect(options.headers.Range).toBe(range);
        expect(options.signal).toBe(fetch.mock.calls[0][1].signal);
        expect(options.cache).toBe("no-store");
        expect(options.method).toBeUndefined();
      }
    }
  );
  it.each([429, 500, 502, 503, 504])("bounds retry attempts for HTTP %i", async (status) => {
    const fetch = vi.fn().mockImplementation(() => errorResponse(status, "backendError"));
    vi.stubGlobal("fetch", fetch);
    const result = expect(fetchDriveDownload(url, name, range)).rejects.toThrow(
      new RegExp(`HTTP ${status}.*backendError`)
    );
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each([
    [403, "insufficientFilePermissions", /Download-Freigabe/],
    [403, "downloadQuotaExceeded", /Download-Limit dieser Datei/],
    [403, "dailyLimitExceeded", /Tageslimit/],
    [403, "API_KEY_HTTP_REFERRER_BLOCKED", /Zugangsdaten/],
    [403, "cannotDownloadAbusiveFile", /Download-Freigabe/],
    [404, "notFound", /nicht mehr erreichbar/],
    [401, "authError", /nicht ausreichend autorisiert/]
  ] as const)("does not retry HTTP %i / %s", async (status, reason, hint) => {
    const fetch = vi.fn().mockResolvedValue(errorResponse(status, reason));
    vi.stubGlobal("fetch", fetch);
    const error = await fetchDriveDownload(url, name, range).catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(hint);
    expect((error as Error).message).toContain(name);
    expect((error as Error).message).not.toContain("secret-api-key");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["5", "Thu, 01 Oct 2026 08:00:05 GMT"])("honors Retry-After %s", async (retryAfter) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, "rateLimitExceeded", retryAfter))
      .mockResolvedValueOnce(new Response("media"));
    vi.stubGlobal("fetch", fetch);
    const result = fetchDriveDownload(url, name, range);
    await vi.runAllTimersAsync();
    await result;
    expect(Date.now()).toBe(Date.parse("2026-10-01T08:00:05Z"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("stops instead of shortening a Retry-After beyond the time budget", async () => {
    const fetch = vi.fn().mockResolvedValue(errorResponse(429, "rateLimitExceeded", "60"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchDriveDownload(url, name, range)).rejects.toThrow(/rateLimitExceeded/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not reset the download deadline for each attempt", async () => {
    const fetch = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 29_000);
      return errorResponse(503, "backendError");
    });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchDriveDownload(url, name, range)).rejects.toThrow(/HTTP 503/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries a network failure before response headers without leaking the request URL", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError(`fetch failed: ${url}`));
    vi.stubGlobal("fetch", fetch);
    const result = expect(fetchDriveDownload(url, name, range)).rejects.toThrow(
      `Drive-Download unterbrochen: ${name}. Bitte spaeter fortsetzen.`
    );
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("cancels every oversized error body without leaking it or retrying indefinitely", async () => {
    const cancel = vi.fn();
    const fetch = vi.fn().mockImplementation(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(17 * 1024));
            },
            cancel
          }),
          { status: 403 }
        )
    );
    vi.stubGlobal("fetch", fetch);
    const result = expect(fetchDriveDownload(url, name, range)).rejects.toThrow(
      /HTTP 403, Fehlerantwort: zu gross.*Nach 3 Download-Versuchen/
    );
    await vi.runAllTimersAsync();
    await result;
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["<html>secret-api-key</html>", "text/html"],
    ["", "application/json"],
    [JSON.stringify({ error: { code: 403, message: String(url) } }), "application/json"],
    [JSON.stringify({ error: { errors: [{ reason: "newGoogleReason" }] } }), "application/json"]
  ])(
    "recovers an unclassified 403 without advancing the range or changing credentials: %s",
    async (body, contentType) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(body, { status: 403, headers: { "Content-Type": contentType } }))
        .mockResolvedValueOnce(new Response("media", { status: 206 }));
      vi.stubGlobal("fetch", fetch);
      const result = fetchDriveDownload(url, name, range);
      await vi.runAllTimersAsync();
      expect((await result).status).toBe(206);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[1]).toEqual(fetch.mock.calls[0]);
      expect(Date.now()).toBe(Date.parse("2026-10-01T08:00:02Z"));
    }
  );
  it.each([
    ["<html>secret-api-key</html>", /Fehlerantwort: HTML/],
    ["not JSON, secret-api-key", /Fehlerantwort: Text/],
    [JSON.stringify({ error: { errors: [{ reason: "newGoogleReason" }] } }), /newGoogleReason/],
    [JSON.stringify({ error: { errors: [{ reason: "secret-api-key" }] } }), /Fehlerantwort: JSON/]
  ] as const)(
    "reports unclassified failures accurately without exposing provider bodies: %s",
    async (body, diagnostic) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => new Response(body, { status: 403 }))
      );
      const result = fetchDriveDownload(url, name, range).catch((error: Error) => error);
      await vi.runAllTimersAsync();
      const error = (await result) as Error;
      expect(error.message).toMatch(diagnostic);
      expect(error.message).toMatch(/fehlende Dateifreigabe ist damit nicht bestaetigt/);
      expect(error.message).toContain("Nach 3 Download-Versuchen");
      expect(error.message).not.toContain("secret-api-key");
      expect(error.message).not.toContain("<html>");
    }
  );
  it("stops retries as soon as Google returns a definite permission error", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 403 }))
      .mockResolvedValueOnce(errorResponse(403, "insufficientFilePermissions"));
    vi.stubGlobal("fetch", fetch);
    const result = expect(fetchDriveDownload(url, name, range)).rejects.toThrow(/insufficientFilePermissions/);
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("prioritizes explicit restrictions over transient or new reason codes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            error: {
              errors: [
                { reason: "newGoogleReason" },
                { reason: "rateLimitExceeded" },
                { reason: "insufficientFilePermissions" }
              ]
            }
          },
          { status: 403 }
        )
      );
    vi.stubGlobal("fetch", fetch);
    await expect(fetchDriveDownload(url, name, range)).rejects.toThrow(/insufficientFilePermissions/);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("recognizes structured Google ErrorInfo without exposing its metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { details: [{ reason: "API_KEY_INVALID", metadata: { key: "secret-api-key" } }] } },
            { status: 400 }
          )
        )
    );
    await expect(fetchDriveDownload(url, name, range)).rejects.toThrow(/HTTP 400, API_KEY_INVALID.*Zugangsdaten/);
  });
});
