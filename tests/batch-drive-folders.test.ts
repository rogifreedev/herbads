import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ credentials: vi.fn(), request: vi.fn(), metadata: vi.fn(), revalidate: vi.fn(), database: vi.fn() }));
vi.mock("@/lib/google-drive-auth", () => ({ hasDriveCredentials: mocks.credentials, driveRequest: mocks.request, fetchDriveMetadata: mocks.metadata }));
vi.mock("@/lib/cache-tags", () => ({ BATCH_CACHE_TAGS: ["batches"], revalidateCacheTags: mocks.revalidate }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
import { listGoogleDriveBatchFolders, runBatchCheck } from "@/lib/batches";

type Folder = { id: string; name: string; webViewLink?: string; modifiedTime?: string };
let tree: Record<string, Folder[]>;
let readParents: string[];
const folder = (id: string, name: string): Folder => ({ id, name, webViewLink: `https://drive.google.com/drive/folders/${id}` });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BATCH_DRIVE_SEARCH_DEPTH", "6");
  vi.stubEnv("BATCH_DRIVE_SEARCH_LIMIT", "1500");
  tree = {};
  readParents = [];
  mocks.credentials.mockReturnValue(true);
  mocks.request.mockImplementation(async () => ({ url: new URL("https://www.googleapis.com/drive/v3/files"), headers: { Authorization: "Bearer fixture" } }));
  mocks.metadata.mockImplementation(async (url: URL) => {
    const parent = url.searchParams.get("q")!.match(/^'([^']+)' in parents/)![1];
    readParents.push(parent);
    return { files: tree[parent] ?? [] };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Drive batch folder discovery", () => {
  it("keeps Adyro Women's numbered folders alongside legacy batches", async () => {
    tree = {
      root: [folder("191", "191 - Shoe Details V3"), folder("190", "190 - Shoe Details V2"), folder("old", "Altes Naming")],
      old: [folder("legacy", "LELA_Comfort_Pregnant_Grafik_Batch1"), folder("nastya", "Nastya Batch 2")],
      legacy: [folder("other", "Other Batches")],
      "191": [folder("format", "9:16")]
    };
    const result = await listGoogleDriveBatchFolders("root", "client");
    expect(result.error).toBeNull();
    expect(result.folders.map((item) => item.id).sort()).toEqual(["190", "191", "legacy", "nastya"]);
    expect(result.folders.find((item) => item.id === "legacy")).toMatchObject({ path: "Altes Naming / LELA_Comfort_Pregnant_Grafik_Batch1", depth: 2 });
    expect(readParents).toEqual(["root", "old"]);
    expect(mocks.request).toHaveBeenCalledWith(undefined, "client");
  });
  it("does not let a nested candidate suppress unrelated unnumbered root batches", async () => {
    tree = {
      root: [folder("summer", "Summer Launch"), folder("archive", "Archive")],
      archive: [folder("legacy", "Other Batches")]
    };
    const result = await listGoogleDriveBatchFolders("root", "client");
    expect(result.folders.map((item) => item.id).sort()).toEqual(["legacy", "summer"]);
  });
  it.each(["Batch", "Batches", "Creative Batch", "Creative Batches", "Ad Batch", "Meta Batches", "Batch 2026", "2026 Batches"])(
    "treats %s as a container rather than a launchable batch", async (name) => {
      tree = {
        root: [folder("container", name)],
        container: [folder("year", "2026")],
        year: [folder("month", "Oktober")],
        month: [folder("launch", "Summer Launch")],
        launch: [folder("format", "9:16")]
      };
      const result = await listGoogleDriveBatchFolders("root", "client");
      expect(result.folders.map((item) => item.id)).toEqual(["launch"]);
      expect(readParents).not.toContain("launch");
    }
  );
  it.each(["Batch 1", "Batch1", "Batch_1", "Nastya Batch 2", "Prima_Grafik_Batch1_V1", "01 Batch", "Other Batches"])(
    "recognizes %s without enumerating its media folders", async (name) => {
      tree = { root: [folder("batch", name)], batch: [folder("child", "1 - Variant")] };
      const result = await listGoogleDriveBatchFolders("root", "client");
      expect(result.folders.map((item) => item.id)).toEqual(["batch"]);
      expect(readParents).toEqual(["root"]);
    }
  );
  it("discovers numbered batches below partner and calendar folders", async () => {
    tree = {
      root: [folder("women", "Women"), folder("men", "Men")],
      women: [folder("year", "2026")],
      year: [folder("women-batch", "191 - Shoe Details")],
      men: [folder("men-batch", "23 - New Shoes")]
    };
    const result = await listGoogleDriveBatchFolders("root", "client");
    expect(result.folders.map((item) => item.id).sort()).toEqual(["men-batch", "women-batch"]);
  });
  it("does not confuse format folders or words starting with batch with named batches", async () => {
    tree = {
      root: [folder("archive", "Archive")],
      archive: [folder("square", "1:1"), folder("portrait", "9:16"), folder("word", "Batching Notes")]
    };
    const result = await listGoogleDriveBatchFolders("root", "client");
    expect(result.folders.map((item) => item.id)).toEqual(["archive"]);
  });
  it("does not expose empty generic containers as batches", async () => {
    tree.root = [folder("container", "Batches"), folder("year", "2026")];
    expect((await listGoogleDriveBatchFolders("root", "client")).folders).toEqual([]);
  });
  it("paginates Drive listings and keeps the provider's folder metadata", async () => {
    mocks.metadata.mockImplementation(async (url: URL) => {
      expect(url.searchParams.get("q")).toContain("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
      expect(url.searchParams.get("supportsAllDrives")).toBe("true");
      expect(url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
      return url.searchParams.has("pageToken")
        ? { files: [folder("second", "192 - Detail")] }
        : { files: [{ ...folder("first", "191 - Shoe Details"), modifiedTime: "2026-09-21T13:47:23.931Z" }], nextPageToken: "page-2" };
    });
    const result = await listGoogleDriveBatchFolders("root", "client");
    expect(result.folders).toHaveLength(2);
    expect(result.folders[0]).toMatchObject({ modifiedTime: "2026-09-21T13:47:23.931Z", webViewLink: "https://drive.google.com/drive/folders/first" });
    expect(mocks.metadata).toHaveBeenCalledTimes(2);
  });
  it("flags a truncated scan instead of reporting a complete snapshot", async () => {
    vi.stubEnv("BATCH_DRIVE_SEARCH_LIMIT", "1");
    tree.root = [folder("first", "191 - Shoe Details"), folder("second", "192 - Details")];
    const result = await listGoogleDriveBatchFolders("root", "client");
    expect(result.error).toContain("begrenzt");
    expect(result.folders).toHaveLength(1);
  });
  it("respects the configured search depth", async () => {
    vi.stubEnv("BATCH_DRIVE_SEARCH_DEPTH", "1");
    tree = { root: [folder("archive", "Archive")], archive: [folder("batch", "Batch1")] };
    expect((await listGoogleDriveBatchFolders("root", "client")).folders.map((item) => item.id)).toEqual(["archive"]);
    expect(readParents).toEqual(["root"]);
  });
  it("reports missing credentials and Drive permission failures", async () => {
    mocks.credentials.mockReturnValue(false);
    expect((await listGoogleDriveBatchFolders("root", "client")).error).toContain("Zugangsdaten");
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.credentials.mockReturnValue(true);
    mocks.metadata.mockRejectedValue(new Error("Drive HTTP 403"));
    expect((await listGoogleDriveBatchFolders("root", "client")).error).toBe("Drive HTTP 403");
  });
});

describe("batch check persistence", () => {
  it.each([true, false])("persists discovered batches and handles cache revalidation=%s", async (revalidateCache) => {
    tree = { root: [folder("191", "191 - Shoe Details V3"), folder("190", "190 - Shoe Details V2")] };
    const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
    const upserts: Array<Record<string, unknown>> = [];
    const setting = { id: "settings", client_id: "client", last_check_status: "completed" };
    const source = { id: "source", client_id: "client", label: "Adyro Women", google_drive_folder_id: "root", enabled: true };
    mocks.database.mockReturnValue({
      from(table: string) {
        let value: Record<string, unknown> | undefined;
        let single = false;
        const query = {
          select: () => query, eq: () => query, order: () => query, not: () => query, delete: () => query,
          maybeSingle() { single = true; return query; },
          single() { single = true; return query; },
          update(input: Record<string, unknown>) { value = input; return query; },
          upsert(rows: Array<Record<string, unknown>>) { upserts.push(...rows); return query; },
          then(resolve: (value: unknown) => unknown) {
            if (value) writes.push({ table, value });
            const data = table === "batch_settings" ? [setting] : table === "batch_drive_folders" ? [source] : table === "meta_ad_sets"
              ? [{ id: "meta", name: "191 - Shoe Details V3", status: "ACTIVE", effective_status: "ACTIVE" }] : [];
            return Promise.resolve({ data: single ? data[0] : data, error: null }).then(resolve);
          }
        };
        return query;
      }
    });
    const result = await runBatchCheck("client", { revalidateCache });
    expect(result.totals).toMatchObject({ folders: 2, live: 1, missing: 1 });
    expect(upserts).toHaveLength(2);
    expect(upserts.find((row) => row.drive_folder_id === "190")).toMatchObject({ client_id: "client", source_folder_id: "source", status: "missing", match_id: null });
    expect(writes.every((write) => ["batch_settings", "batch_drive_folders"].includes(write.table))).toBe(true);
    expect(mocks.revalidate).toHaveBeenCalledTimes(revalidateCache ? 1 : 0);
  });
});
