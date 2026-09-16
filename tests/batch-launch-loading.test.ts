import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  media: vi.fn(),
  matching: vi.fn(),
  options: vi.fn(),
  tables: [] as string[],
  denied: false
}));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-drive", () => ({ listBatchMedia: mocks.media }));
vi.mock("@/lib/batch-media-matching", () => ({ matchBatchMedia: mocks.matching }));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  getLiveBatchOptions: mocks.options
}));
import { getBatchLaunchContext, getBatchLaunchMedia, getBatchLaunchOptions } from "@/lib/batch-launch";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "configured");
  mocks.tables = [];
  mocks.denied = false;
  mocks.media.mockResolvedValue({ files: [], ignoredFiles: [] });
  mocks.matching.mockResolvedValue({ groups: [], matchingUnavailable: false });
  mocks.options.mockResolvedValue({ campaigns: [], templates: [] });
  mocks.database.mockReturnValue({
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      mocks.tables.push(table);
      const filters: Record<string, string> = {};
      const data = () => {
        if (mocks.denied || (filters.client_id && filters.client_id !== "client")) return [];
        if (table === "batch_folder_checks") return [{ drive_folder_id: "folder", name: "Batch" }];
        if (table === "meta_ad_accounts") return [{ id: "account", meta_account_id: "act_111", currency: "EUR" }];
        if (table === "meta_campaigns")
          return [{ meta_campaign_id: "123", name: "Synced campaign", status: "ACTIVE", raw: {} }];
        if (table === "meta_ad_sets")
          return [{ meta_adset_id: "456", name: "Synced adset", raw: { campaign_id: "123" } }];
        return [];
      };
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          filters[key] = value;
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        single: async () => ({ data: data()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: data()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve)
      };
      return query;
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("progressive batch loading", () => {
  it("returns account settings without waiting for Drive, matching or live Meta", async () => {
    for (const mock of [mocks.media, mocks.matching, mocks.options]) mock.mockReturnValue(new Promise(() => {}));
    const result = await getBatchLaunchContext("client", "folder", "account");
    expect(result.campaigns[0].name).toBe("Synced campaign");
    expect(result.templates[0].id).toBe("456");
    expect(result.metaConfigured).toBe(true);
    expect(result).not.toHaveProperty("files");
    expect(mocks.tables.filter((table) => table === "meta_ad_accounts")).toHaveLength(1);
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.matching).not.toHaveBeenCalled();
    expect(mocks.options).not.toHaveBeenCalled();
  });
  it("rejects a different client's account before loading account-specific data", async () => {
    await expect(getBatchLaunchContext("client", "folder", "foreign-account")).rejects.toThrow(/Werbekonto/);
    expect(mocks.tables).not.toContain("batch_launch_presets");
    expect(mocks.tables).not.toContain("meta_ad_sets");
  });
  it("validates the folder before Drive access or matching", async () => {
    mocks.denied = true;
    await expect(getBatchLaunchMedia("client", "folder")).rejects.toThrow(/Batch-Ordner/);
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.matching).not.toHaveBeenCalled();
  });
  it("returns the matched media independently from account settings", async () => {
    expect(await getBatchLaunchMedia("client", "folder")).toEqual({
      files: [],
      ignoredFiles: [],
      groups: [],
      matchingUnavailable: false
    });
    expect(mocks.media).toHaveBeenCalledWith("folder");
    expect(mocks.matching).toHaveBeenCalledWith([]);
    expect(mocks.tables).toEqual(["batch_folder_checks"]);
  });
  it("rechecks account ownership before every live options request, including cache hits", async () => {
    await getBatchLaunchOptions("client", "account");
    await expect(getBatchLaunchOptions("other-client", "account")).rejects.toThrow(/Werbekonto/);
    expect(mocks.options).toHaveBeenCalledTimes(1);
    expect(mocks.options).toHaveBeenCalledWith("act_111");
    expect(mocks.tables).toEqual(["meta_ad_accounts", "meta_ad_accounts"]);
  });
});
