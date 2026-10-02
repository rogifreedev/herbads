import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchOverviewItem } from "@/lib/batches";

const mocks = vi.hoisted(() => ({ database: vi.fn(), meta: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/meta/batch-launch", () => ({ metaLaunchRequest: mocks.meta }));
vi.mock("@/lib/cache-tags", () => ({ BATCH_CACHE_TAGS: ["batches"], revalidateCacheTags: mocks.revalidate }));

type Row = Record<string, string | null>;
type Operation = { table: string; values?: Row; filters: Array<[string, unknown]>; range?: [number, number] };
let tables: Record<string, Row[]>;
let operations: Operation[];
let failTable: string | null;

function adset(index = 1, clientId = "client"): Row {
  return { id: `adset-${index}`, client_id: clientId, meta_adset_id: String(1000 + index), status: "PAUSED", effective_status: "PAUSED" };
}
function match(index = 1, clientId = "client"): Row {
  return {
    id: `check-${index}`, client_id: clientId, match_type: "adset", match_id: `adset-${index}`,
    drive_folder_id: `drive-${index}`, name: `${index} - Batch`, path: `${index} - Batch`,
    status: "found", match_status: "PAUSED", match_effective_status: "PAUSED", checked_at: "2026-10-01T10:00:00Z"
  };
}
function overviewItem(): BatchOverviewItem {
  return {
    id: "drive-1", name: "101 - BP Neue Claims", path: "101 - BP Neue Claims", depth: 1,
    sourceFolderId: "root", sourceFolderLabel: "Blytz", webViewLink: null, modifiedTime: null,
    checkedAt: "2026-10-01T10:00:00Z", status: "found",
    match: { id: "adset-1", type: "adset", name: "101 - BP Neue Claims", status: "PAUSED", effectiveStatus: "PAUSED", href: "/adsets/1" }
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "test-token");
  failTable = null;
  operations = [];
  tables = {
    meta_ad_sets: [adset()], batch_folder_checks: [match()],
    batch_settings: [{ id: "settings", client_id: "client" }], batch_drive_folders: []
  };
  mocks.meta.mockImplementation(async (path: string) => {
    const ids = new URL(path, "https://fixture").searchParams.get("ids")!.split(",");
    return Object.fromEntries(ids.map((id) => [id, { id, status: "ACTIVE", effective_status: "ACTIVE" }]));
  });
  mocks.database.mockReturnValue({
    from(table: string) {
      const operation: Operation = { table, filters: [] };
      let single = false;
      const execute = () => {
        operations.push(operation);
        if (failTable === table) return { data: null, error: { message: "Database unavailable" } };
        let rows = (tables[table] ?? []).filter((row) => operation.filters.every(([key, value]) =>
          Array.isArray(value) ? value.includes(row[key]) : value === "NOT_NULL" ? row[key] !== null : row[key] === value
        ));
        if (operation.range) rows = rows.slice(operation.range[0], operation.range[1] + 1);
        if (operation.values) rows.forEach((row) => Object.assign(row, operation.values));
        return { data: single ? rows[0] ?? null : structuredClone(rows), error: null };
      };
      const query = {
        select: () => query,
        order: () => query,
        eq(key: string, value: string) { operation.filters.push([key, value]); return query; },
        in(key: string, values: string[]) { operation.filters.push([key, values]); return query; },
        not(key: string) { operation.filters.push([key, "NOT_NULL"]); return query; },
        range(start: number, end: number) { operation.range = [start, end]; return query; },
        update(values: Row) { operation.values = values; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve: (result: ReturnType<typeof execute>) => unknown) { return Promise.resolve(execute()).then(resolve); }
      };
      return query;
    }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("batch effective status", () => {
  it.each([
    ["ACTIVE", "ACTIVE", true], ["ACTIVE", "CAMPAIGN_PAUSED", false], ["PAUSED", "ACTIVE", false],
    ["PAUSED", "PAUSED", false], ["ACTIVE", "WITH_ISSUES", false], ["ACTIVE", "ARCHIVED", false],
    ["ACTIVE", "DELETED", false], ["ACTIVE", null, true], [null, "ACTIVE", true], [null, null, false],
    [" active ", " active ", true]
  ])("configured %s, effective %s => live %s", async (status, effective, live) => {
    const { isBatchMetaLive } = await import("@/lib/batch-status");
    expect(isBatchMetaLive(status, effective)).toBe(live);
  });
  it("replaces stale status without changing Drive metadata or unmatched rows", async () => {
    const { applyBatchAdsetStatuses } = await import("@/lib/batch-status");
    const original = overviewItem();
    const missing = { ...original, id: "missing", match: null, status: "missing" as const };
    const [updated, unchanged] = applyBatchAdsetStatuses([original, missing], [{ id: "adset-1", meta_adset_id: "1001", status: "ACTIVE", effective_status: "ACTIVE" }]);
    expect(updated).toEqual({ ...original, status: "live", match: { ...original.match, status: "ACTIVE", effectiveStatus: "ACTIVE" } });
    expect(unchanged).toBe(missing);
    expect(original.status).toBe("found");
    expect(applyBatchAdsetStatuses([original], [])[0]).toBe(original);
  });
  it("reads current local adset status on initial page load and updates totals", async () => {
    tables.meta_ad_sets[0].status = "ACTIVE";
    tables.meta_ad_sets[0].effective_status = "ACTIVE";
    const { getBatchOverview } = await import("@/lib/batches");
    const overview = await getBatchOverview("client");
    expect(overview.items[0].status).toBe("live");
    expect(overview.totals).toMatchObject({ live: 1, found: 0 });
    expect(mocks.meta).not.toHaveBeenCalled();
  });
  it("keeps the snapshot and exposes an error if the current database status cannot be read", async () => {
    failTable = "meta_ad_sets";
    const { getBatchOverview } = await import("@/lib/batches");
    const overview = await getBatchOverview("client");
    expect(overview.items[0].status).toBe("found");
    expect(overview.settings?.lastCheckError).toMatch(/Meta-Status/);
  });
});

describe("live Meta batch refresh", () => {
  it("uses the existing authenticated GET transport without sending Meta writes", async () => {
    const { metaLaunchRequest } = await vi.importActual<typeof import("@/lib/meta/batch-launch")>("@/lib/meta/batch-launch");
    mocks.meta.mockImplementation(metaLaunchRequest);
    const fetcher = vi.fn(async () => Response.json({ "1001": { id: "1001", status: "ACTIVE", effective_status: "ACTIVE" } }));
    vi.stubGlobal("fetch", fetcher);
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    await refreshBatchMetaStatuses("client");
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({
      origin: "https://graph.facebook.com", search: "?ids=1001&fields=id,status,effective_status"
    }), expect.objectContaining({
      method: "GET", headers: expect.objectContaining({ Authorization: "Bearer test-token" }), cache: "no-store"
    }));
  });
  it("refreshes only this client's matched adsets using GET and preserves the Drive check date", async () => {
    tables.meta_ad_sets.push(adset(2, "other"), adset(3));
    tables.batch_folder_checks.push(match(2, "other"));
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    expect(await refreshBatchMetaStatuses("client")).toMatchObject({ changed: true, checked: 1, unavailable: 0 });
    expect(mocks.meta).toHaveBeenCalledExactlyOnceWith("?ids=1001&fields=id,status,effective_status");
    expect(tables.meta_ad_sets.map((row) => row.status)).toEqual(["ACTIVE", "PAUSED", "PAUSED"]);
    expect(tables.batch_folder_checks[0]).toMatchObject({ status: "live", match_status: "ACTIVE", checked_at: "2026-10-01T10:00:00Z" });
    for (const op of operations) expect(op.filters).toContainEqual(["client_id", "client"]);
    for (const op of operations.filter((op) => op.values)) {
      expect(Object.keys(op.values!)).not.toContain("checked_at");
      expect(Object.keys(op.values!)).not.toContain("updated_at");
    }
    expect(mocks.revalidate).toHaveBeenCalled();
  });
  it("downgrades live batches when the campaign is paused", async () => {
    tables.batch_folder_checks[0].status = "live";
    mocks.meta.mockResolvedValue({ "1001": { id: "1001", status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" } });
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    await refreshBatchMetaStatuses("client");
    expect(tables.batch_folder_checks[0]).toMatchObject({ status: "found", match_status: "ACTIVE", match_effective_status: "CAMPAIGN_PAUSED" });
  });
  it("does not write unchanged statuses", async () => {
    mocks.meta.mockResolvedValue({ "1001": { id: "1001", status: "PAUSED", effective_status: "PAUSED" } });
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    expect(await refreshBatchMetaStatuses("client")).toMatchObject({ changed: false });
    expect(operations.filter((op) => op.values)).toHaveLength(0);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("keeps unavailable, malformed and foreign matches unchanged while updating valid results", async () => {
    tables.meta_ad_sets.push(adset(2), adset(3), adset(4, "other"), { ...adset(5), meta_adset_id: "invalid?ids=9999" });
    tables.batch_folder_checks.push(match(2), match(3), match(4), match(5), match(6));
    mocks.meta.mockResolvedValue({ "1001": { id: "1001", status: "ACTIVE", effective_status: "ACTIVE" }, "1002": { id: "9999", status: "ACTIVE", effective_status: "ACTIVE" }, "1003": { error: { message: "Access denied" } } });
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    expect(await refreshBatchMetaStatuses("client")).toMatchObject({ changed: true, checked: 1, unavailable: 5 });
    expect(tables.batch_folder_checks.map((row) => row.status)).toEqual(["live", "found", "found", "found", "found", "found"]);
    expect(mocks.meta).toHaveBeenCalledExactlyOnceWith("?ids=1001%2C1002%2C1003&fields=id,status,effective_status");
  });
  it("deduplicates concurrent refreshes, isolates clients and tokens, and expires the cache", async () => {
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    await Promise.all([refreshBatchMetaStatuses("client"), refreshBatchMetaStatuses("client")]);
    await refreshBatchMetaStatuses("client");
    expect(mocks.meta).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(45_001);
    await refreshBatchMetaStatuses("client");
    expect(mocks.meta).toHaveBeenCalledTimes(2);
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "rotated-token");
    await refreshBatchMetaStatuses("client");
    expect(mocks.meta).toHaveBeenCalledTimes(3);
    tables.meta_ad_sets.push(adset(2, "other"));
    tables.batch_folder_checks.push(match(2, "other"));
    await refreshBatchMetaStatuses("other");
    expect(mocks.meta).toHaveBeenCalledTimes(4);
  });
  it("retains statuses on a Meta failure and cools down before retrying", async () => {
    mocks.meta.mockRejectedValue(new Error("Rate limited"));
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    await expect(refreshBatchMetaStatuses("client")).rejects.toThrow("Rate limited");
    await expect(refreshBatchMetaStatuses("client")).rejects.toThrow("Rate limited");
    expect(mocks.meta).toHaveBeenCalledTimes(1);
    expect(operations.filter((op) => op.values)).toHaveLength(0);
    vi.advanceTimersByTime(45_001);
    await expect(refreshBatchMetaStatuses("client")).rejects.toThrow("Rate limited");
    expect(mocks.meta).toHaveBeenCalledTimes(2);
  });
  it("paginates snapshots and bounds database and Meta request sizes", async () => {
    tables.meta_ad_sets = Array.from({ length: 501 }, (_, index) => adset(index));
    tables.batch_folder_checks = Array.from({ length: 501 }, (_, index) => match(index));
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    expect(await refreshBatchMetaStatuses("client")).toMatchObject({ checked: 501, unavailable: 0 });
    expect(mocks.meta).toHaveBeenCalledTimes(11);
    expect(operations.filter((op) => op.range).map((op) => op.range)).toEqual([[0, 499], [500, 999]]);
    for (const op of operations) for (const [, value] of op.filters) if (Array.isArray(value)) expect(value.length).toBeLessThanOrEqual(200);
    expect(tables.batch_folder_checks.every((row) => row.status === "live")).toBe(true);
  });
  it("never contacts Meta when there are no matched adsets", async () => {
    tables.batch_folder_checks = [];
    const { refreshBatchMetaStatuses } = await import("@/lib/batch-status");
    expect(await refreshBatchMetaStatuses("client")).toMatchObject({ checked: 0, unavailable: 0, changed: false });
    expect(mocks.meta).not.toHaveBeenCalled();
  });
});
