import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchMediaFile } from "@/lib/batch-launch-types";
import { MAX_IMAGE_EDGE, MAX_META_IMAGE_BYTES } from "@/lib/batch-media-limits";
import { feed } from "./batch-launch-fixtures";

const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/lib/batch-launch-drive", () => ({ downloadBatchImage: mocks.download }));
import { prepareBatchImage } from "@/lib/batch-image-upload";

let source: Buffer;
let directory: string | undefined;
beforeEach(() => {
  directory = undefined;
  mocks.download.mockReset();
  mocks.download.mockImplementation(async (_file: BatchMediaFile, destination: string) => {
    directory = dirname(destination);
    await writeFile(destination, source);
  });
});
afterEach(async () => {
  if (directory) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

describe("Meta image preparation", () => {
  it.each(["jpeg", "png"] as const)("preserves a small %s byte-for-byte", async (format) => {
    source = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#d43454" } })
      .toFormat(format)
      .toBuffer();
    const file = { ...feed, size: source.length, name: `small.${format}`, mimeType: `image/${format}` };
    const image = await prepareBatchImage(file);
    expect(image.bytes.equals(source)).toBe(true);
    expect(image.name).toBe(file.name);
  });
  it("accepts and optimizes a real PNG over the old 30 MiB limit", async () => {
    source = await sharp({ create: { width: 3600, height: 3200, channels: 3, background: "#42b57b" } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(source.length).toBeGreaterThan(30 * 1024 * 1024);
    const image = await prepareBatchImage({ ...feed, name: "v3_9/16", size: source.length });
    expect(image.bytes.length).toBeLessThan(MAX_META_IMAGE_BYTES);
    expect(image.name).toBe("v3_9/16.jpg");
    expect(await sharp(image.bytes).metadata()).toMatchObject({ format: "jpeg", width: 3600, height: 3200 });
  }, 15000);
  it("resizes a tall transparent image proportionally without discarding alpha", async () => {
    source = await sharp({
      create: { width: 2880, height: 5120, channels: 4, background: { r: 200, g: 50, b: 80, alpha: 0.5 } }
    })
      .png()
      .toBuffer();
    const image = await prepareBatchImage({ ...feed, size: source.length });
    expect(image.name).toMatch(/\.png$/);
    const metadata = await sharp(image.bytes).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 2304, height: MAX_IMAGE_EDGE, hasAlpha: true });
    const { data } = await sharp(image.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBeGreaterThan(120);
    expect(data[3]).toBeLessThan(135);
  }, 15000);
  it("applies EXIF orientation before resizing", async () => {
    source = await sharp({ create: { width: 5120, height: 2880, channels: 3, background: "#f23064" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const image = await prepareBatchImage({
      ...feed,
      name: "rotated.jpeg",
      mimeType: "image/jpeg",
      size: source.length
    });
    const metadata = await sharp(image.bytes).metadata();
    expect(metadata).toMatchObject({ width: 2304, height: 4096, format: "jpeg" });
    expect(metadata.orientation).toBeUndefined();
  }, 15000);
  it("reduces dimensions again for an incompressible transparent PNG", async () => {
    source = await sharp(randomBytes(3000 * 3000 * 4), { raw: { width: 3000, height: 3000, channels: 4 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const image = await prepareBatchImage({ ...feed, size: source.length });
    expect(image.bytes.length).toBeLessThanOrEqual(MAX_META_IMAGE_BYTES);
    expect(await sharp(image.bytes).metadata()).toMatchObject({
      width: 2560,
      height: 2560,
      hasAlpha: true,
      format: "png"
    });
  }, 30000);
  it("rejects corrupt files and removes their temporary data", async () => {
    source = Buffer.from([0xff, 0xd8, 0xff, 0]);
    await expect(prepareBatchImage({ ...feed, size: source.length })).rejects.toThrow(/Bild kann nicht gelesen werden/);
  });
  it("rejects other actual formats even when Drive labels them PNG", async () => {
    source = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
      .webp()
      .toBuffer();
    await expect(prepareBatchImage({ ...feed, size: source.length })).rejects.toThrow(/statisches JPEG-/);
  });
  it("rejects pixel bombs before full decoding", async () => {
    source = await sharp({ create: { width: 101, height: 101, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer();
    const frame = source.indexOf(Buffer.from([0xff, 0xc0]));
    expect(frame).toBeGreaterThan(0);
    source.writeUInt16BE(10_001, frame + 5);
    source.writeUInt16BE(10_000, frame + 7);
    await expect(sharp(source, { limitInputPixels: 100_000_000 }).metadata()).rejects.toThrow(/pixel limit/);
    await expect(prepareBatchImage({ ...feed, size: source.length })).rejects.toThrow(/100 Megapixel/);
  });
  it("cleans up partial downloads without masking their error", async () => {
    mocks.download.mockImplementationOnce(async (_file: BatchMediaFile, destination: string) => {
      directory = dirname(destination);
      await writeFile(destination, "partial");
      throw new Error("Drive-Download ist unvollstaendig.");
    });
    await expect(prepareBatchImage(feed)).rejects.toThrow(/unvollstaendig/);
  });
});
