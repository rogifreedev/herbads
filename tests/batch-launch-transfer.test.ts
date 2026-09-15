import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBatchMedia, listBatchMedia } from "@/lib/batch-launch-drive";
import { MetaLaunchError, metaLaunchRequest } from "@/lib/meta/batch-launch";
import { feed } from "./batch-launch-fixtures";

beforeEach(() => {
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "test-key");
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "test-token");
  vi.stubEnv("META_API_VERSION", "v25.0");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("bounded Drive transfers", () => {
  it("downloads exactly the requested range", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("ab", { status: 206, headers: { "Content-Range": "bytes 1-2/4" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await downloadBatchMedia(feed, 1, 3)).toString()).toBe("ab");
    expect(fetch.mock.calls[0][1].headers.Range).toBe("bytes=1-2");
  });
  it("rejects wrong ranges, missing bytes and excessive data", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce(new Response("ab", { status: 206, headers: { "Content-Range": "bytes 0-1/4" } }));
    await expect(downloadBatchMedia(feed, 1, 3)).rejects.toThrow(/falschen Dateiabschnitt/);
    fetch.mockResolvedValueOnce(new Response("a", { status: 200 }));
    await expect(downloadBatchMedia(feed)).rejects.toThrow(/unvollstaendig/);
    fetch.mockResolvedValueOnce(new Response("abcde", { status: 200 }));
    await expect(downloadBatchMedia(feed)).rejects.toThrow(/grossen Dateiabschnitt/);
  });
  it("rejects invalid offsets before making requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const start of [NaN, Infinity, -1, 0.5])
      await expect(downloadBatchMedia(feed, start, 4)).rejects.toThrow(/Upload-Abschnitt/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads subfolders and lists unsupported files without uploading them", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          files: [
            { id: "sub", name: "feed", mimeType: "application/vnd.google-apps.folder" },
            { id: "pdf", name: "notes.pdf", mimeType: "application/pdf" }
          ]
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          files: [
            {
              id: "image",
              name: "ad.png",
              mimeType: "image/png",
              size: "4",
              imageMediaMetadata: { width: 1080, height: 1080 }
            }
          ]
        })
      );
    vi.stubGlobal("fetch", fetch);
    const result = await listBatchMedia("root");
    expect(result.files[0]).toMatchObject({ id: "image", path: "feed/ad.png", placement: "feed" });
    expect(result.ignoredFiles).toEqual(["notes.pdf"]);
  });
});

describe("Meta write safety", () => {
  it("puts the token only in the authorization header and uses the video host", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "123" }));
    vi.stubGlobal("fetch", fetch);
    await metaLaunchRequest("act_111/advideos", { upload_phase: "start" }, true);
    expect(String(fetch.mock.calls[0][0])).toBe("https://graph-video.facebook.com/v25.0/act_111/advideos");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
  });
  it("never blindly retries an interrupted creation", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetch);
    await expect(metaLaunchRequest("act_111/adsets", { status: "PAUSED" })).rejects.toMatchObject({ uncertain: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("distinguishes explicit rejection from an ambiguous server failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { message: "Invalid parameter" } }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ error: { message: "Server failure" } }, { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    await expect(metaLaunchRequest("act_111/adsets", {})).rejects.toMatchObject({ uncertain: false });
    await expect(metaLaunchRequest("act_111/adsets", {})).rejects.toMatchObject({ uncertain: true });
  });
  it("treats a non-JSON write response as uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })));
    await expect(metaLaunchRequest("act_111/ads", {})).rejects.toBeInstanceOf(MetaLaunchError);
  });
});
