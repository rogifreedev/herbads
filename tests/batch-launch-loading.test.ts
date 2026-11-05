import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  media: vi.fn(),
  matching: vi.fn(),
  options: vi.fn(),
  request: vi.fn(),
  update: vi.fn(),
  currency: "EUR" as string | null,
  updateError: false,
  identities: vi.fn(),
  tables: [] as string[],
  denied: false
}));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-drive", () => ({ listBatchMedia: mocks.media }));
vi.mock("@/lib/meta/batch-identities", () => ({ getLiveBatchIdentities: mocks.identities }));
vi.mock("@/lib/batch-media-matching", () => ({ matchBatchMedia: mocks.matching }));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  getLiveBatchOptions: mocks.options,
  metaLaunchRequest: mocks.request
}));
import {
  getBatchLaunchContext,
  getBatchLaunchMedia,
  getBatchLaunchOptions,
  getBatchLaunchIdentities
} from "@/lib/batch-launch";
import { MetaLaunchError } from "@/lib/meta/batch-launch";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "configured");
  mocks.tables = [];
  mocks.denied = false;
  mocks.currency = "EUR";
  mocks.updateError = false;
  mocks.request.mockResolvedValue({ id: "act_111", account_id: "111", name: "US account", currency: "USD" });
  mocks.media.mockResolvedValue({ files: [], ignoredFiles: [] });
  mocks.matching.mockResolvedValue({ groups: [], matchingUnavailable: false });
  mocks.options.mockResolvedValue({ campaigns: [], templates: [] });
  mocks.identities.mockResolvedValue({ pages: [], instagramAccounts: [] });
  mocks.database.mockReturnValue({
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      mocks.tables.push(table);
      const filters: Record<string, string> = {};
      let patch: Record<string, unknown> | undefined;
      const data = () => {
        if (mocks.denied || (filters.client_id && filters.client_id !== "client")) return [];
        if (table === "batch_folder_checks") return [{ drive_folder_id: "folder", name: "Batch" }];
        if (table === "meta_ad_accounts") return [{ id: "account", client_id: "client", meta_account_id: "act_111", name: null, currency: mocks.currency }];
        if (table === "meta_campaigns")
          return [{ meta_campaign_id: "123", name: "Synced campaign", status: "ACTIVE", raw: {} }];
        if (table === "meta_ad_sets")
          return [{ meta_adset_id: "456", name: "Synced adset", raw: { campaign_id: "123" } }];
        return [];
      };
      const query = {
        update: (values: Record<string, unknown>) => { patch = values; return query; },
        select: () => query,
        eq: (key: string, value: string) => {
          filters[key] = value;
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        single: async () => {
          if (patch) {
            mocks.update(table, filters, patch);
            if (mocks.updateError) return { data: null, error: { message: "Write failed" } };
            mocks.currency = patch.currency as string;
          }
          return { data: data()[0] ?? null, error: null };
        },
        maybeSingle: async () => ({ data: data()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve)
      };
      return query;
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("progressive batch loading", () => {
  it.each([null, "null", "", "US", "ZZZ"])("repairs missing/invalid currency %j from this account's Meta metadata", async (currency) => {
    mocks.currency = currency;
    const context = await getBatchLaunchContext("client", "folder", "account");
    expect(context.accounts[0]).toMatchObject({ currency: "USD", name: "US account" });
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith("act_111?fields=id,account_id,name,currency");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
      "meta_ad_accounts", { id: "account", client_id: "client", meta_account_id: "act_111" },
      { currency: "USD", name: "US account" }
    );
    await getBatchLaunchContext("client", "folder", "account");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("normalizes valid stored currencies without live Meta calls", async () => {
    mocks.currency = " usd ";
    expect((await getBatchLaunchContext("client", "folder", "account")).accounts[0].currency).toBe("USD");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("never guesses a currency when Meta is unavailable", async () => {
    mocks.currency = null;
    mocks.request.mockRejectedValue(new Error("Rate limit"));
    await expect(getBatchLaunchContext("client", "folder", "account")).rejects.toThrow(/Kontowaehrung.*Meta/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([null, "null", "", "ZZZ"])("does not persist invalid live currency %j", async (currency) => {
    mocks.currency = null;
    mocks.request.mockResolvedValue({ id: "act_111", account_id: "111", currency });
    await expect(getBatchLaunchContext("client", "folder", "account")).rejects.toThrow(/keine gueltige Kontowaehrung/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("checks client ownership before loading missing currency and rejects mismatched Meta responses", async () => {
    mocks.currency = null;
    await expect(getBatchLaunchContext("client", "folder", "foreign-account")).rejects.toThrow(/Werbekonto/);
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.request.mockResolvedValue({ id: "act_222", account_id: "222", currency: "USD" });
    await expect(getBatchLaunchContext("client", "folder", "account")).rejects.toThrow(/gehoeren nicht/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not use an unpersisted repair when the account update fails", async () => {
    mocks.currency = null;
    mocks.updateError = true;
    await expect(getBatchLaunchContext("client", "folder", "account")).rejects.toThrow(/nicht gespeichert/);
  });
  it("scopes identity lookups to the client before any Meta request, even on refresh", async () => {
    expect(await getBatchLaunchIdentities("client", "account", true)).toEqual({ pages: [], instagramAccounts: [] });
    await expect(getBatchLaunchIdentities("other-client", "account")).rejects.toThrow(/Werbekonto/);
    expect(mocks.identities).toHaveBeenCalledTimes(1);
    expect(mocks.identities).toHaveBeenCalledWith("act_111", true);
  });
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
    expect(mocks.media).toHaveBeenCalledWith("folder", "client");
    expect(mocks.matching).toHaveBeenCalledWith([]);
    expect(mocks.tables).toEqual(["batch_folder_checks"]);
  });
  it("rechecks account ownership before every live options request, including cache hits", async () => {
    await getBatchLaunchOptions("client", "account", true);
    await expect(getBatchLaunchOptions("other-client", "account", true)).rejects.toThrow(/Werbekonto/);
    expect(mocks.options).toHaveBeenCalledTimes(1);
    expect(mocks.options).toHaveBeenCalledWith("act_111", false);
    expect(mocks.tables).toEqual(["meta_ad_accounts", "meta_ad_accounts"]);
  });
  it("keeps synchronized campaign and adset options usable during a Meta rate limit", async () => {
    mocks.options.mockRejectedValueOnce(
      new MetaLaunchError("Too many calls from this ad account", false, { code: 80004 })
    );
    const result = await getBatchLaunchOptions("client", "account", true);
    expect(result.campaigns).toEqual([expect.objectContaining({ id: "123", name: "Synced campaign" })]);
    expect(result.templates).toEqual([expect.objectContaining({ id: "456", name: "Synced adset" })]);
  });
});
