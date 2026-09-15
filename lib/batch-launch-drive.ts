import "server-only";
import { getRequiredEnv } from "@/lib/env";
import { MAX_BATCH_FILES, mediaPlacement } from "@/lib/batch-launch-plan";
import type { BatchMediaFile } from "@/lib/batch-launch-types";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  imageMediaMetadata?: { width?: number; height?: number };
  videoMediaMetadata?: { width?: number; height?: number };
  capabilities?: { canDownload?: boolean };
};

function driveUrl(fileId?: string) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files${fileId ? `/${encodeURIComponent(fileId)}` : ""}`);
  url.searchParams.set("key", getRequiredEnv("GOOGLE_DRIVE_API_KEY"));
  url.searchParams.set("supportsAllDrives", "true");
  return url;
}

export async function listBatchMedia(rootId: string) {
  const files: BatchMediaFile[] = [];
  const ignoredFiles: string[] = [];
  const queue = [{ id: rootId, path: "", depth: 0 }];
  const seen = new Set<string>();
  while (queue.length) {
    const folder = queue.shift()!;
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);
    if (seen.size > 150 || folder.depth > 8)
      throw new Error("Der Batch enthaelt zu viele Unterordner. Bitte einen konkreten Batch-Ordner auswaehlen.");
    let pageToken: string | undefined;
    do {
      const url = driveUrl();
      url.searchParams.set("q", `'${folder.id.replace(/'/g, "\\'")}' in parents and trashed = false`);
      url.searchParams.set(
        "fields",
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,capabilities(canDownload),imageMediaMetadata(width,height),videoMediaMetadata(width,height))"
      );
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const data = (await response.json()) as {
        files?: DriveFile[];
        nextPageToken?: string;
        error?: { message?: string };
      };
      if (!response.ok || data.error)
        throw new Error(data.error?.message ?? "Drive-Dateien konnten nicht geladen werden.");
      for (const file of data.files ?? []) {
        const path = folder.path ? `${folder.path}/${file.name}` : file.name;
        if (file.mimeType === "application/vnd.google-apps.folder") {
          queue.push({ id: file.id, path, depth: folder.depth + 1 });
          continue;
        }
        const kind = ["image/jpeg", "image/png"].includes(file.mimeType)
          ? "image"
          : ["video/mp4", "video/quicktime"].includes(file.mimeType)
            ? "video"
            : null;
        if (!kind || file.capabilities?.canDownload === false) {
          ignoredFiles.push(path);
          continue;
        }
        const size = Number(file.size);
        if (!Number.isSafeInteger(size) || size <= 0 || size > (kind === "image" ? 30 * 1024 * 1024 : 4 * 1024 ** 3))
          throw new Error(`Datei zu gross oder ohne gueltige Groesse: ${path}`);
        const dimensions = kind === "image" ? file.imageMediaMetadata : file.videoMediaMetadata;
        const width = dimensions?.width ?? null;
        const height = dimensions?.height ?? null;
        files.push({
          id: file.id,
          name: file.name,
          path,
          mimeType: file.mimeType,
          size,
          width,
          height,
          kind,
          placement: mediaPlacement(width, height),
          thumbnailUrl: file.thumbnailLink ?? null,
          modifiedTime: file.modifiedTime ?? ""
        });
        if (files.length > MAX_BATCH_FILES) throw new Error(`Maximal ${MAX_BATCH_FILES} Mediendateien pro Batch.`);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, "de", { numeric: true }));
  return { files, ignoredFiles };
}

export async function downloadBatchMedia(file: BatchMediaFile, start = 0, end = file.size) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > file.size ||
    end - start > 32 * 1024 * 1024
  )
    throw new Error("Ungueltiger Upload-Abschnitt.");
  const url = driveUrl(file.id);
  url.searchParams.set("alt", "media");
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end - 1}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });
  if (response.status !== 206 && !(response.status === 200 && start === 0 && end === file.size)) {
    await response.body?.cancel();
    throw new Error(`Drive-Download fehlgeschlagen: ${file.name} (${response.status}).`);
  }
  if (response.status === 206 && response.headers.get("Content-Range") !== `bytes ${start}-${end - 1}/${file.size}`) {
    await response.body?.cancel();
    throw new Error("Drive lieferte einen falschen Dateiabschnitt. Die Datei wurde moeglicherweise geaendert.");
  }
  // Read with a hard limit even if Drive ignores Range or reports an incorrect Content-Length.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Leere Drive-Antwort.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > end - start) throw new Error("Drive lieferte einen unerwartet grossen Dateiabschnitt.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  if (total !== end - start) throw new Error("Drive-Download ist unvollstaendig.");
  return Buffer.concat(chunks);
}
