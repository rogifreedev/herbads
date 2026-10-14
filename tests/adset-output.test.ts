import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), range: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ rpc: mocks.rpc }) }));
import { getAdsetOutput, outputDateRange } from "@/lib/adset-output";
import { summarizeAdsetOutput, type AdsetOutputBatch } from "@/lib/adset-output-summary";
import { GET } from "@/app/api/adset-output/route";
import { navItems } from "@/lib/navigation";
import { getPageTitle } from "@/lib/routes";

const batch = (id: string, overrides: Partial<AdsetOutputBatch> = {}): AdsetOutputBatch => ({
  job_id: id, client_id: "client", client_name: "Partner", account_id: "account", account_name: "Account",
  meta_account_id: "act_1", meta_adset_id: id, batch_name: id, folder_id: "folder",
  first_delivery_date: "2026-10-01", media_type: "video", ...overrides
});
beforeEach(() => {
  vi.clearAllMocks();
  const query = { order: vi.fn().mockReturnThis(), range: mocks.range };
  mocks.rpc.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [], error: null });
});

describe("Adset Output summary", () => {
  it("counts adsets, not assets, days or repeated job records; mixed batches count once", () => {
    const result = summarizeAdsetOutput([batch("1"), batch("1"), batch("2", { media_type: "static" }), batch("3", { media_type: "mixed" })]);
    expect(result.totals).toEqual({ total: 3, video: 1, static: 1, mixed: 1, unknown: 0 });
    expect(result.accounts[0].batches).toHaveLength(3);
  });
  it("keeps different accounts with identical names and external IDs separate", () => {
    const result = summarizeAdsetOutput([batch("1"), batch("1", { account_id: "second" })]);
    expect(result.accounts).toHaveLength(2);
    expect(result.totals.total).toBe(2);
  });
  it("retains unknown types and provides zero totals for empty periods", () => {
    expect(summarizeAdsetOutput([batch("1", { media_type: "unknown" })]).totals.unknown).toBe(1);
    expect(summarizeAdsetOutput([])).toEqual({ totals: { total: 0, video: 0, static: 0, mixed: 0, unknown: 0 }, accounts: [] });
  });
  it("adds Output under Dashboard while preserving the overview", () => {
    expect(navItems.find((item) => item.title === "dashboard")?.children?.map((item) => item.href))
      .toEqual(["/dashboard", "/dashboard/adset-output"]);
    expect(getPageTitle("/dashboard/adset-output")).toBe("nav.adsetOutput");
  });
});

describe("Adset Output queries", () => {
  it.each(["since=2026-02-30", "until=wrong", "since=", "since=2026-10-10&until=2026-10-01"])("rejects invalid dates: %s", async (query) => {
    const response = await GET(new Request(`https://example.com/api/adset-output?${query}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalidDate" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("supports inclusive dates, open intervals and all time", () => {
    expect(outputDateRange(new URLSearchParams("since=2026-10-01&until=2026-10-01")))
      .toMatchObject({ since: "2026-10-01", until: "2026-10-01", dateError: false });
    expect(outputDateRange(new URLSearchParams("until=2026-10-01"))).toMatchObject({ since: null, until: "2026-10-01" });
    expect(outputDateRange(new URLSearchParams("range=all"))).toMatchObject({ since: null, until: null });
  });
  it("paginates without truncating the report at the Supabase row limit", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => batch(String(i))), error: null });
    mocks.range.mockResolvedValueOnce({ data: [batch("500")], error: null });
    const result = await getAdsetOutput(new URLSearchParams("since=2026-10-01&until=2026-10-14"));
    expect(result.totals.total).toBe(501);
    expect(mocks.rpc).toHaveBeenCalledWith("get_adset_output", { p_since: "2026-10-01", p_until: "2026-10-14" });
    expect(mocks.range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });
  it("returns a private read-only report and never leaks database error details", async () => {
    const good = await GET(new Request("https://example.com/api/adset-output?range=all"));
    expect(good.status).toBe(200);
    expect(good.headers.get("cache-control")).toBe("private, no-store");
    mocks.range.mockResolvedValue({ data: null, error: { message: "Private database details" } });
    const failed = await GET(new Request("https://example.com/api/adset-output"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "loadError" });
  });
});
