import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBatchIdentity, validateBatchIdentity } from "@/lib/batch-launch-identities";
import { launchInput } from "./batch-launch-fixtures";

const identities = {
  pages: [{ id: "123", name: "Page" }],
  instagramAccounts: [{ id: "456", name: "@instagram", legacyId: "789" }]
};
describe("identity selection", () => {
  it("automatically selects a single available identity when the source has none", () => {
    expect(resolveBatchIdentity({ ...launchInput.copy, pageId: "", instagramId: "" }, identities)).toMatchObject({
      pageId: "123",
      instagramId: "456"
    });
  });
  it("does not guess when multiple identities are available", () => {
    expect(
      resolveBatchIdentity(
        { ...launchInput.copy, pageId: "", instagramId: "" },
        { pages: [...identities.pages, { id: "124", name: "Other" }], instagramAccounts: [] }
      )
    ).toMatchObject({ pageId: "", instagramId: "" });
  });
  it("preserves manual choices, including an explicit empty Instagram choice", () => {
    expect(
      resolveBatchIdentity({ ...launchInput.copy, pageId: "999", instagramId: "789" }, identities, {
        pageId: "123",
        instagramId: ""
      })
    ).toMatchObject({ pageId: "123", instagramId: "" });
  });
  it("resolves a legacy template Instagram ID to its current IG User ID", () => {
    expect(resolveBatchIdentity({ ...launchInput.copy, instagramId: "789" }, identities).instagramId).toBe("456");
  });
  it("keeps an unavailable source visible instead of silently changing the advertiser", () => {
    const copy = resolveBatchIdentity({ ...launchInput.copy, pageId: "999" }, identities);
    expect(copy.pageId).toBe("999");
    expect(() => validateBatchIdentity(copy, identities)).toThrow(/Facebook/);
  });
  it("allows no separate Instagram account but rejects a foreign account", () => {
    expect(() =>
      validateBatchIdentity({ ...launchInput.copy, pageId: "123", instagramId: "" }, identities)
    ).not.toThrow();
    expect(() => validateBatchIdentity({ ...launchInput.copy, pageId: "123", instagramId: "999" }, identities)).toThrow(
      /Instagram/
    );
  });
});

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "test-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("account identity API", () => {
  it("uses account edges, follows cursors, deduplicates and strips unrelated response data", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith("/connected_instagram_accounts")) return Response.json({ data: [] });
      if (url.pathname.endsWith("/instagram_accounts"))
        return Response.json({
          data: [{ id: "456", username: "brand", legacy_instagram_user_id: "789", access_token: "never-return-this" }]
        });
      if (url.searchParams.has("after"))
        return Response.json({
          data: [
            { id: "123", name: "Page" },
            { id: "124", name: "Another page" }
          ]
        });
      return Response.json({
        data: [{ id: "123", name: "Page" }],
        paging: { next: "https://ignored.example", cursors: { after: "cursor" } }
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    expect(await getLiveBatchIdentities("act_111")).toEqual({
      pages: [
        { id: "124", name: "Another page" },
        { id: "123", name: "Page" }
      ],
      instagramAccounts: [{ id: "456", name: "@brand", legacyId: "789" }]
    });
    expect(fetcher.mock.calls.every(([url]) => url.pathname.startsWith("/v25.0/act_111/"))).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("reuses in-flight requests, isolates accounts and tokens, and supports fresh validation", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    await Promise.all([getLiveBatchIdentities("act_111"), getLiveBatchIdentities("act_111")]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await getLiveBatchIdentities("act_111", true);
    expect(fetcher).toHaveBeenCalledTimes(6);
    await getLiveBatchIdentities("act_222");
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "rotated");
    await getLiveBatchIdentities("act_111");
    expect(fetcher).toHaveBeenCalledTimes(12);
    vi.advanceTimersByTime(60_001);
    await getLiveBatchIdentities("act_111");
    expect(fetcher).toHaveBeenCalledTimes(15);
  });
  it("does not cache permission errors as empty successful lists", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: "Permission denied" } }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    await expect(getLiveBatchIdentities("act_111")).rejects.toThrow("Permission denied");
    fetcher.mockImplementation(async () => Response.json({ data: [] }));
    expect(await getLiveBatchIdentities("act_111")).toEqual({ pages: [], instagramAccounts: [] });
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
  it("includes a connected-only Kohl identity, follows its pagination and accepts it for creation", async () => {
    const kohl = { id: "17841402245652920", username: "kohl_test" };
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      expect(init.method).toBe("GET");
      expect(url.pathname.startsWith("/v25.0/act_438274112849522/")).toBe(true);
      if (url.pathname.endsWith("/promote_pages"))
        return Response.json({ data: [{ id: "185898518141154", name: "Kohl" }] });
      if (url.pathname.endsWith("/connected_instagram_accounts"))
        return Response.json(
          url.searchParams.has("after")
            ? { data: [kohl] }
            : { data: [], paging: { next: "https://ignored.example", cursors: { after: "next" } } }
        );
      return Response.json({ data: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    const result = await getLiveBatchIdentities("act_438274112849522");
    expect(result.instagramAccounts).toEqual([{ id: kohl.id, name: "@kohl_test" }]);
    const copy = resolveBatchIdentity({ ...launchInput.copy, pageId: "185898518141154", instagramId: kohl.id }, result);
    expect(() => validateBatchIdentity(copy, result)).not.toThrow();
    expect((await getLiveBatchIdentities("act_438274112849522", true)).instagramAccounts).toEqual(
      result.instagramAccounts
    );
    expect(fetcher).toHaveBeenCalledTimes(8);
  });
  it("includes page-linked identities and merges names and legacy IDs without leaking page data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        if (url.pathname.endsWith("/promote_pages")) {
          expect(url.searchParams.get("fields")).toContain("instagram_business_account");
          expect(url.searchParams.get("fields")).toContain("connected_instagram_account");
          return Response.json({
            data: [
              {
                id: "123",
                name: "Page",
                access_token: "secret",
                instagram_business_account: { id: "456", username: "brand" },
                connected_instagram_account: { id: "789", username: "page_only", password: "secret" }
              }
            ]
          });
        }
        return Response.json({
          data: [
            { id: "456", legacy_instagram_user_id: "555" },
            { id: "invalid", username: "bad" }
          ]
        });
      })
    );
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    expect(await getLiveBatchIdentities("act_111")).toEqual({
      pages: [{ id: "123", name: "Page" }],
      instagramAccounts: [
        { id: "456", name: "@brand", legacyId: "555" },
        { id: "789", name: "@page_only" }
      ]
    });
  });
  it("retains connected identities when direct and expanded page permissions fail and retries partial results", async () => {
    let partial = true;
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith("/connected_instagram_accounts"))
        return Response.json({ data: [{ id: "456", username: "connected" }] });
      if (
        partial &&
        (url.pathname.endsWith("/instagram_accounts") ||
          url.searchParams.get("fields")?.includes("instagram_business_account"))
      )
        return Response.json({ error: { message: "Permission denied" } }, { status: 403 });
      return Response.json({ data: url.pathname.endsWith("/promote_pages") ? [{ id: "123", name: "Page" }] : [] });
    });
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    expect(await getLiveBatchIdentities("act_111")).toEqual({
      pages: [{ id: "123", name: "Page" }],
      instagramAccounts: [{ id: "456", name: "@connected" }],
      warnings: ["pageInstagramUnavailable", "directInstagramUnavailable"]
    });
    partial = false;
    expect((await getLiveBatchIdentities("act_111")).warnings).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
  it("does not hide direct identities when the connected edge is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        if (url.pathname.endsWith("/connected_instagram_accounts"))
          return Response.json({ error: { message: "Not available" } }, { status: 400 });
        return Response.json({
          data: url.pathname.endsWith("/instagram_accounts") ? [{ id: "456", username: "direct" }] : []
        });
      })
    );
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    expect(await getLiveBatchIdentities("act_111")).toMatchObject({
      instagramAccounts: [{ id: "456", name: "@direct" }],
      warnings: ["connectedInstagramUnavailable"]
    });
  });
  it("accepts verified page linkage when both account lists fail, but never reports a total failure as empty", async () => {
    let linked = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        if (url.pathname.endsWith("/promote_pages"))
          return Response.json({
            data: [
              {
                id: "123",
                name: "Page",
                ...(linked ? { instagram_business_account: { id: "456", username: "linked" } } : {})
              }
            ]
          });
        return Response.json({ error: { message: "Permission denied" } }, { status: 403 });
      })
    );
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    expect(await getLiveBatchIdentities("act_111")).toMatchObject({
      instagramAccounts: [{ id: "456", name: "@linked" }],
      warnings: ["directInstagramUnavailable", "connectedInstagramUnavailable"]
    });
    linked = false;
    await expect(getLiveBatchIdentities("act_111", true)).rejects.toThrow("Permission denied");
  });
});
