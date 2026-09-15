import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ database: vi.fn(), meta: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  metaLaunchRequest: mocks.meta
}));
import { getTemplateFavorites, setTemplateFavorite } from "@/lib/batch-launch";

let favorites: { ad_account_id: string; meta_adset_id: string }[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "");
  favorites = [{ ad_account_id: "other", meta_adset_id: "456" }];
  mocks.database.mockReturnValue({
    from(table: string) {
      const filters: Record<string, string> = {};
      let values: { ad_account_id: string; meta_adset_id: string } | undefined;
      let deleting = false;
      const execute = () => {
        if (
          values &&
          !favorites.some(
            (row) => row.ad_account_id === values!.ad_account_id && row.meta_adset_id === values!.meta_adset_id
          )
        )
          favorites.push(values);
        if (deleting)
          favorites = favorites.filter(
            (row) => !(row.ad_account_id === filters.ad_account_id && row.meta_adset_id === filters.meta_adset_id)
          );
        return { data: favorites.filter((row) => row.ad_account_id === filters.ad_account_id), error: null };
      };
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: string) {
          filters[key] = value;
          return query;
        },
        in() {
          return query;
        },
        single: async () => ({
          data:
            table === "meta_ad_accounts" && filters.client_id === "client" && filters.id === "account"
              ? { id: "account", client_id: "client", meta_account_id: "act_111", currency: "EUR" }
              : null,
          error: null
        }),
        maybeSingle: async () => ({
          data: filters.ad_account_id === "account" && filters.meta_adset_id === "123" ? { id: "internal" } : null,
          error: null
        }),
        order: async () => execute(),
        upsert(value: typeof values) {
          values = value;
          return query;
        },
        delete() {
          deleting = true;
          return query;
        },
        then(resolve: (result: ReturnType<typeof execute>) => unknown) {
          return Promise.resolve(execute()).then(resolve);
        }
      };
      return query;
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("account-scoped adset favorites", () => {
  it("persists, deduplicates and removes a favorite without modifying Meta", async () => {
    expect(await setTemplateFavorite("client", "account", "123", true)).toEqual(["123"]);
    expect(await setTemplateFavorite("client", "account", "123", true)).toEqual(["123"]);
    expect(await setTemplateFavorite("client", "account", "123", false)).toEqual([]);
    expect(favorites).toEqual([{ ad_account_id: "other", meta_adset_id: "456" }]);
    expect(mocks.meta).not.toHaveBeenCalled();
  });
  it("rejects other partners and adsets from other accounts", async () => {
    await expect(getTemplateFavorites("foreign", "account")).rejects.toThrow(/Werbekonto/);
    await expect(setTemplateFavorite("client", "account", "456", true)).rejects.toThrow(/nicht verfuegbar/);
    expect(favorites).toHaveLength(1);
  });
  it("checks live Meta ownership before favoriting", async () => {
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "test-token");
    mocks.meta.mockResolvedValue({ account_id: "999", status: "ACTIVE" });
    await expect(setTemplateFavorite("client", "account", "123", true)).rejects.toThrow(/nicht verfuegbar/);
    mocks.meta.mockResolvedValue({ account_id: "111", status: "ACTIVE" });
    expect(await setTemplateFavorite("client", "account", "123", true)).toEqual(["123"]);
    expect(mocks.meta).toHaveBeenLastCalledWith("123?fields=account_id,status");
  });
  it("rejects malformed IDs and non-boolean toggles", async () => {
    await expect(setTemplateFavorite("client", "account", "123?access_token=x", true)).rejects.toThrow();
    await expect(setTemplateFavorite("client", "account", "123", "false" as unknown as boolean)).rejects.toThrow();
    expect(mocks.database).not.toHaveBeenCalled();
  });
});
