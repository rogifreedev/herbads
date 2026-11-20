import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.db }));
vi.mock("@/lib/meta/batch-launch", () => ({ metaLaunchList: mocks.list }));
vi.mock("@/lib/cache-tags", () => ({ BATCH_CACHE_TAGS: [], revalidateCacheTags: vi.fn() }));
import { readBatchMetaCatalog } from "@/lib/batch-meta-catalog";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let writes: string[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "test-token");
  tables = {
    meta_ad_accounts: [
      { id: "account", client_id: "client", meta_account_id: "act_123" },
      { id: "foreign", client_id: "other", meta_account_id: "456" }
    ],
    meta_ad_sets: []
  };
  writes = [];
  mocks.list.mockResolvedValue([{ id: "1001", account_id: "123", name: "183 - Bundle Offer", status: "ACTIVE", effective_status: "ACTIVE", start_time: "2026-12-01T10:00:00Z" }]);
  mocks.db.mockReturnValue({ from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let range = [0, Infinity];
    let update: Row | undefined;
    let insert: Row[] | undefined;
    const query = {
      select: () => query, order: () => query,
      eq(key: string, value: unknown) { filters.push([key, value]); return query; },
      range(from: number, to: number) { range = [from, to]; return query; },
      update(values: Row) { update = values; return query; },
      upsert(rows: Row[], options: unknown) {
        expect(options).toEqual({ onConflict: "ad_account_id,meta_adset_id", ignoreDuplicates: true });
        insert = rows;
        return query;
      },
      then(resolve: (result: unknown) => unknown) {
        if (insert) {
          writes.push(table);
          tables[table].push(...insert.map((row) => ({ id: `stored-${row.meta_adset_id}`, ...row })));
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        expect(filters).toContainEqual(["client_id", "client"]);
        const rows = tables[table].filter((row) => filters.every(([key, value]) =>
          key === "raw" ? JSON.stringify(row.raw) === value : row[key] === value
        )).slice(range[0], range[1] + 1);
        if (update) { writes.push(table); rows.forEach((row) => Object.assign(row, update)); }
        return Promise.resolve({ data: structuredClone(rows), error: null }).then(resolve);
      }
    };
    return query;
  } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("batch Meta catalog discovery", () => {
  it("reads every Meta cursor page using GET, including a scheduled adset on the last page", async () => {
    const { metaLaunchList } = await vi.importActual<typeof import("@/lib/meta/batch-launch")>("@/lib/meta/batch-launch");
    mocks.list.mockImplementation(metaLaunchList);
    const fetcher = vi.fn(async (input: URL, init: RequestInit) => {
      const url = new URL(input);
      expect(init.method).toBe("GET");
      expect(url.pathname).toMatch(/\/act_123\/adsets$/);
      return Response.json(url.searchParams.has("after")
        ? { data: [{ id: "1002", account_id: "123", name: "Scheduled", status: "ACTIVE", effective_status: "ACTIVE", start_time: "2026-12-01T10:00:00Z" }] }
        : { data: [{ id: "1001", account_id: "123", name: "Paused", status: "PAUSED", effective_status: "PAUSED" }], paging: { next: "next", cursors: { after: "cursor-2" } } });
    });
    vi.stubGlobal("fetch", fetcher);
    const rows = await readBatchMetaCatalog("client", true);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ meta_adset_id: "1002", raw: { start_time: "2026-12-01T10:00:00Z" } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("after")).toBe("cursor-2");
  });

  it("finds scheduled adsets without delivery insights and only reads linked accounts", async () => {
    const rows = await readBatchMetaCatalog("client", true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "stored-1001", name: "183 - Bundle Offer", raw: { start_time: "2026-12-01T10:00:00Z" } });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith("act_123/adsets?fields=id,account_id,name,campaign_id,status,effective_status,start_time,end_time&limit=100");
    expect(writes).toEqual(["meta_ad_sets"]);
  });

  it("refreshes existing names and schedules without clearing targeting or campaign relations", async () => {
    tables.meta_ad_sets.push({ id: "stored", client_id: "client", ad_account_id: "account", campaign_id: "campaign", meta_adset_id: "1001", name: "Old name", status: "PAUSED", effective_status: "PAUSED", raw: { targeting: { countries: ["US"] }, campaign_id: "9001" }, updated_at: "2026-11-19T10:00:00Z" });
    const [row] = await readBatchMetaCatalog("client", true);
    expect(row).toMatchObject({ id: "stored", name: "183 - Bundle Offer", status: "ACTIVE", campaign_id: "campaign", raw: { targeting: { countries: ["US"] }, campaign_id: "9001", start_time: "2026-12-01T10:00:00Z" } });
  });

  it("keeps the catalog intact when Meta fails", async () => {
    mocks.list.mockRejectedValue(new Error("Rate limited"));
    await expect(readBatchMetaCatalog("client", true)).rejects.toThrow("Rate limited");
    expect(writes).toEqual([]);
  });

  it("rejects another account's response before persisting any data", async () => {
    mocks.list.mockResolvedValue([{ id: "1001", account_id: "456", name: "Wrong account", status: "ACTIVE", effective_status: "ACTIVE" }]);
    await expect(readBatchMetaCatalog("client", true)).rejects.toThrow("zugeordnet");
    expect(writes).toEqual([]);
  });

  it("does not call Meta on a normal cached read", async () => {
    await readBatchMetaCatalog("client");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
