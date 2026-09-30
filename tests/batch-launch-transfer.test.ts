import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadBatchImage, downloadBatchMedia, listBatchMedia } from "@/lib/batch-launch-drive";
import { MAX_SOURCE_IMAGE_BYTES, MAX_TRANSFER_BYTES, MAX_VIDEO_BYTES } from "@/lib/batch-media-limits";
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
  it.each([40_000_000, MAX_SOURCE_IMAGE_BYTES])("accepts a %i-byte source image", async (size) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ files: [{ id: "image", name: "v3_9/16", mimeType: "image/png", size: String(size) }] })
        )
    );
    expect((await listBatchMedia("root")).files[0].size).toBe(size);
  });
  it("reports the image size limit separately from missing metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            files: [{ id: "image", name: "v3_9/16", mimeType: "image/png", size: String(MAX_SOURCE_IMAGE_BYTES + 1) }]
          })
        )
    );
    await expect(listBatchMedia("root")).rejects.toThrow(/Bild zu gross: v3_9\/16.*200 MB pro Bild/);
  });
  it("retains the 4 GiB video limit", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const size of [MAX_VIDEO_BYTES, MAX_VIDEO_BYTES + 1]) {
      fetch.mockResolvedValueOnce(
        Response.json({ files: [{ id: "video", name: "ad.mp4", mimeType: "video/mp4", size: String(size) }] })
      );
      if (size === MAX_VIDEO_BYTES) expect((await listBatchMedia("root")).files[0].size).toBe(size);
      else await expect(listBatchMedia("root")).rejects.toThrow(/4 GiB pro Video/);
    }
  });
  it.each([undefined, "", "0", "NaN"])("resolves missing/invalid Drive size %s from a one-byte range", async (size) => {
    const cancel = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ files: [{ id: "image", name: "ad.png", mimeType: "image/png", size }] }))
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          status: 206,
          headers: { "Content-Range": "bytes 0-0/40000000" }
        })
      );
    vi.stubGlobal("fetch", fetch);
    expect((await listBatchMedia("root")).files[0].size).toBe(40_000_000);
    expect(fetch.mock.calls[1][1].headers.Range).toBe("bytes=0-0");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("uses Content-Length when Drive ignores the size probe, without reading the full body", async () => {
    const cancel = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ files: [{ id: "image", name: "ad.png", mimeType: "image/png" }] }))
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          status: 200,
          headers: { "Content-Length": "40000000" }
        })
      );
    vi.stubGlobal("fetch", fetch);
    expect((await listBatchMedia("root")).files[0].size).toBe(40_000_000);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each<ResponseInit>([
    { status: 206, headers: { "Content-Range": "bytes 0-0/*" } },
    { status: 200, headers: { "Content-Length": "0" } },
    { status: 200, headers: { "Content-Length": "100", "Content-Encoding": "gzip" } },
    { status: 403, headers: { "Content-Length": "100" } }
  ])("reports an unusable size probe instead of a misleading size-limit error: %j", async (init) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ files: [{ id: "image", name: "ad.png", mimeType: "image/png" }] }))
        .mockResolvedValueOnce(new Response("", init))
    );
    await expect(listBatchMedia("root")).rejects.toThrow(/keine gueltige Dateigroesse: ad.png/);
  });
  it("streams large images to disk in order while retaining the buffered transfer cap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herbads-transfer-test-"));
    const destination = join(directory, "image");
    const first = Buffer.alloc(17 * 1024 * 1024, 1);
    const second = Buffer.alloc(17 * 1024 * 1024, 2);
    const file = { ...feed, size: first.length + second.length };
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(first);
            controller.enqueue(second);
            controller.close();
          }
        }),
        { status: 206, headers: { "Content-Range": `bytes 0-${file.size - 1}/${file.size}` } }
      )
    );
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(downloadBatchMedia(file)).rejects.toThrow(/Upload-Abschnitt/);
      expect(fetch).not.toHaveBeenCalled();
      expect(file.size).toBeGreaterThan(MAX_TRANSFER_BYTES);
      await downloadBatchImage(file, destination);
      const bytes = await readFile(destination);
      expect(bytes.length).toBe(file.size);
      expect(bytes.subarray(0, first.length).equals(first)).toBe(true);
      expect(bytes.subarray(first.length).equals(second)).toBe(true);
    } finally {
      await unlink(destination);
      await rmdir(directory);
    }
  });
  it.each([
    { body: "a", size: 4, error: /unvollstaendig/ },
    { body: "abcde", size: 4, error: /grossen Dateiabschnitt/ },
    { body: "", size: MAX_SOURCE_IMAGE_BYTES + 1, error: /Upload-Abschnitt/ }
  ])("enforces disk download bounds: %j", async ({ body, size, error }) => {
    const directory = await mkdtemp(join(tmpdir(), "herbads-transfer-test-"));
    const destination = join(directory, "image");
    const fetch = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(downloadBatchImage({ ...feed, size }, destination)).rejects.toThrow(error);
      if (size > MAX_SOURCE_IMAGE_BYTES) expect(fetch).not.toHaveBeenCalled();
    } finally {
      await unlink(destination);
      await rmdir(directory);
    }
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
