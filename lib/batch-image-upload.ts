import "server-only";
import { mkdtemp, open, readFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { downloadBatchImage } from "@/lib/batch-launch-drive";
import { MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS, MAX_META_IMAGE_BYTES } from "@/lib/batch-media-limits";
import type { BatchMediaFile } from "@/lib/batch-launch-types";

export async function prepareBatchImage(file: BatchMediaFile) {
  const directory = await mkdtemp(join(tmpdir(), "herbads-meta-image-"));
  const source = join(directory, "source");
  try {
    await downloadBatchImage(file, source);
    // Restrict the native decoder to the supported formats, regardless of Drive's MIME label.
    const handle = await open(source, "r");
    const signature = Buffer.alloc(8);
    try {
      await handle.read(signature, 0, signature.length, 0);
    } finally {
      await handle.close();
    }
    if (
      !signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) &&
      !signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      throw new Error(`Kein gueltiges statisches JPEG-/PNG-Bild: ${file.path}`);
    const options = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" as const };
    const metadata = await sharp(source, options)
      .metadata()
      .catch(() => {
        throw new Error(`Bild kann nicht gelesen werden (JPEG/PNG, maximal 100 Megapixel): ${file.path}`);
      });
    if (
      !metadata.width ||
      !metadata.height ||
      !["jpeg", "png"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error(`Kein gueltiges statisches JPEG-/PNG-Bild: ${file.path}`);
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS)
      throw new Error(`Bildaufloesung zu gross: ${file.path}. Maximal 100 Megapixel.`);
    if (file.size <= MAX_META_IMAGE_BYTES && Math.max(metadata.width, metadata.height) <= MAX_IMAGE_EDGE)
      return { bytes: await readFile(source), name: file.name };

    const deadline = Date.now() + 20_000;
    // Preserve the whole motif and transparency; never crop or enlarge the Drive original.
    for (const edge of [MAX_IMAGE_EDGE, 3200, 2560]) {
      const seconds = Math.floor((deadline - Date.now()) / 1000);
      if (seconds < 1) break;
      const pipeline = sharp(source, options)
        .autoOrient()
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .toColourspace("srgb")
        .timeout({ seconds });
      const transparent = Boolean(metadata.hasAlpha);
      const bytes = await (
        transparent ? pipeline.png({ compressionLevel: 6 }) : pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      )
        .toBuffer()
        .catch((cause: unknown) => {
          throw new Error(
            `Bild konnte nicht fuer Meta vorbereitet werden: ${file.path}. Bitte den Bildexport pruefen.`,
            { cause }
          );
        });
      if (bytes.length <= MAX_META_IMAGE_BYTES)
        return { bytes, name: `${file.name.replace(/\.(jpe?g|png)$/i, "")}.${transparent ? "png" : "jpg"}` };
    }
    throw new Error(`Bild konnte nicht rechtzeitig auf Upload-Groesse verkleinert werden: ${file.path}`);
  } finally {
    await unlink(source).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rmdir(directory);
  }
}
