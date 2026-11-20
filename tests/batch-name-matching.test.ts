import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ database: vi.fn(), metadata: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/google-drive-auth", () => ({
  hasDriveCredentials: () => true,
  driveRequest: async () => ({ url: new URL("https://www.googleapis.com/drive/v3/files"), headers: {} }),
  fetchDriveMetadata: mocks.metadata
}));
vi.mock("@/lib/cache-tags", () => ({ BATCH_CACHE_TAGS: ["batches"], revalidateCacheTags: mocks.revalidate }));
import { runBatchCheck } from "@/lib/batches";

let adsets: Array<{ id: string; name: string; status: string; effective_status: string; raw?: Record<string, unknown> }>;
let saved: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BATCH_DRIVE_SEARCH_DEPTH", "1");
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "");
  adsets = [];
  saved = [];
  mocks.database.mockImplementation(() => ({
    from(table: string) {
      let single = false;
      let range: [number, number] | undefined;
      const query = {
        select: () => query,
        eq(key: string, value: string) {
          if (table === "meta_ad_sets" && key === "client_id") expect(value).toBe("client");
          return query;
        },
        order: () => query, not: () => query, delete: () => query, update: () => query,
        range(start: number, end: number) { range = [start, end]; return query; },
        single() { single = true; return query; },
        maybeSingle() { single = true; return query; },
        upsert(rows: Array<Record<string, unknown>>) {
          expect(table).toBe("batch_folder_checks");
          saved.push(...rows);
          return query;
        },
        then(resolve: (result: unknown) => unknown) {
          const rows = table === "batch_settings" ? [{ id: "settings", client_id: "client" }]
            : table === "batch_drive_folders" ? [{ id: "root", client_id: "client", label: "Batches", google_drive_folder_id: "drive-root", enabled: true }]
            : table === "meta_ad_sets" ? adsets : [];
          return Promise.resolve({ data: single ? rows[0] : range ? rows.slice(range[0], range[1] + 1) : rows, error: null }).then(resolve);
        }
      };
      return query;
    }
  }));
});

afterEach(() => vi.unstubAllEnvs());

describe("batch to Meta adset name matching", () => {
  it.each([
    ["135 - Adventskalender Video", "Video", false],
    ["135 - Adventskalender Video", "Adventskalender Video", false],
    ["135 - Adventskalender Video", "135", false],
    ["135 - Adventskalender Video", "135 - Adventskalender Video", true],
    ["135 - Adventskalender Video", "14.10.2026_135_Adventskalender_Video", true],
    ["135 - Adventskalender Video", "135 - Adventskalender Video - Copy", true],
    ["135 - Adventskalender Video", "1135 - Adventskalender Video", false],
    ["135 - Adventskalender Video", "135 - Adventskalender Videos", false],
    ["135 - Adventskalender Video", "136 - Adventskalender Video", false],
    ["Batch 1", "Batch 10", false],
    ["Batch 1", "Test_Batch 1_DE", true],
    ["01 - Sommer & Sonne", "01_sommer_und_sonne", true],
    ["A", "A", true],
    ["A", "Test A", false],
    ["---", "---", false]
  ])("%s against %s => match %s", async (folderName, adsetName, matched) => {
    mocks.metadata.mockResolvedValue({ files: [{ id: "drive-batch", name: folderName }] });
    adsets = [{ id: "meta", name: adsetName, status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" }];
    const result = await runBatchCheck("client");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe(matched ? "found" : "missing");
    expect(result.items[0].match?.id ?? null).toBe(matched ? "meta" : null);
    expect(saved[0]).toMatchObject({
      drive_folder_id: "drive-batch",
      status: matched ? "found" : "missing",
      match_id: matched ? "meta" : null,
      match_name: matched ? adsetName : null,
      match_href: matched ? "/clients/client/adsets/meta" : null
    });
  });

  it("prefers an exact match over an active prefixed match or a generic name", async () => {
    const name = "135 - Adventskalender Video";
    mocks.metadata.mockResolvedValue({ files: [{ id: "drive-batch", name }] });
    adsets = [
      { id: "generic", name: "Video", status: "ACTIVE", effective_status: "ACTIVE" },
      { id: "dated", name: `14.10.2026_${name}`, status: "ACTIVE", effective_status: "ACTIVE" },
      { id: "exact", name, status: "PAUSED", effective_status: "PAUSED" }
    ];
    expect((await runBatchCheck("client")).items[0].match?.id).toBe("exact");
    expect(saved[0]).toMatchObject({ status: "found", match_id: "exact" });
  });

  it("finds a future scheduled batch beyond the first database page and stores it as found", async () => {
    const name = "135 - Adventskalender Video";
    const start = new Date(Date.now() + 86400000).toISOString();
    mocks.metadata.mockResolvedValue({ files: [{ id: "drive-batch", name }] });
    adsets = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), name: `Other ${i}`, status: "PAUSED", effective_status: "PAUSED" }));
    adsets.push({ id: "scheduled", name, status: "ACTIVE", effective_status: "ACTIVE", raw: { start_time: start } });
    const result = await runBatchCheck("client");
    expect(result.items[0]).toMatchObject({ status: "scheduled", match: { id: "scheduled", startTime: start } });
    expect(result.totals).toMatchObject({ live: 0, scheduled: 1, missing: 0, metaEntities: 1002 });
    expect(saved[0]).toMatchObject({ status: "found", match_id: "scheduled" });
  });
});
