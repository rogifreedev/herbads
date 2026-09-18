import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  request: vi.fn(),
  list: vi.fn(),
  database: vi.fn(),
  filters: [] as unknown[],
  foreign: false
}));
vi.mock("@/lib/batch-launch", () => ({ launchAccount: mocks.account }));
vi.mock("@/lib/meta/batch-launch", () => ({ metaLaunchRequest: mocks.request, metaLaunchList: mocks.list }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
import { getBatchTemplateCopy } from "@/lib/batch-template-copy";
import { GET } from "@/app/api/clients/[clientId]/batches/launch/copy/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "test");
  mocks.foreign = false;
  mocks.filters = [];
  mocks.account.mockResolvedValue({ meta_account_id: "act_111" });
  mocks.request.mockResolvedValue({ account_id: "111" });
  mocks.list.mockResolvedValue([
    {
      id: "123",
      name: "Ad",
      status: "ACTIVE",
      creative: { asset_feed_spec: { bodies: [{ text: "First" }, { text: "Second" }] } }
    }
  ]);
  mocks.database.mockReturnValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          mocks.filters.push([table, key, value]);
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: mocks.foreign ? null : { id: "scoped-adset" }, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: [{ meta_ad_id: "123", name: "Ad", status: "ACTIVE", creative: { raw: { body: "Stored body" } } }],
            error: null
          }).then(resolve)
      };
      return query;
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("reference copy endpoint", () => {
  it("returns full variants privately and authorizes the client account first", async () => {
    const response = await GET(new Request("https://example.com/copy?accountId=account&templateId=456"), {
      params: Promise.resolve({ clientId: "client" })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).sources[0].copy.primaryTexts).toEqual(["First", "Second"]);
    expect(mocks.account).toHaveBeenCalledWith("client", "account");
    expect(mocks.request).toHaveBeenCalledWith("456?fields=account_id");
    expect(mocks.list).toHaveBeenCalledWith(expect.stringContaining("456/ads?fields="));
  });
  it("rejects foreign client accounts before any Meta request", async () => {
    mocks.account.mockRejectedValue(new Error("Foreign account"));
    await expect(getBatchTemplateCopy("other", "account", "456")).rejects.toThrow("Foreign account");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects foreign adsets before reading their ads", async () => {
    mocks.request.mockResolvedValue({ account_id: "999" });
    await expect(getBatchTemplateCopy("client", "account", "456")).rejects.toThrow(/Werbekonto/);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each(["", "../../ads", "456?fields=access_token"])("rejects invalid template IDs: %s", async (id) => {
    await expect(getBatchTemplateCopy("client", "account", id)).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("scopes synced fallback ads to both the authorized account and adset", async () => {
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "");
    expect((await getBatchTemplateCopy("client", "account", "456")).sources[0].copy.primaryTexts).toEqual([
      "Stored body"
    ]);
    expect(mocks.filters).toEqual([
      ["meta_ad_sets", "ad_account_id", "account"],
      ["meta_ad_sets", "meta_adset_id", "456"],
      ["meta_ads", "ad_account_id", "account"],
      ["meta_ads", "adset_id", "scoped-adset"]
    ]);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not query synced ads for a foreign adset", async () => {
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "");
    mocks.foreign = true;
    await expect(getBatchTemplateCopy("client", "account", "456")).rejects.toThrow(/Werbekonto/);
    expect(mocks.filters).toHaveLength(2);
  });
  it("reports Meta failure instead of silently importing another adset's or stale texts", async () => {
    mocks.list.mockRejectedValue(new Error("Meta unavailable"));
    const response = await GET(new Request("https://example.com/copy?accountId=account&templateId=456"), {
      params: Promise.resolve({ clientId: "client" })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Meta unavailable" });
  });
});
