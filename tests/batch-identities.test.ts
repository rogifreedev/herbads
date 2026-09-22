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
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("reuses in-flight requests, isolates accounts and tokens, and supports fresh validation", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    await Promise.all([getLiveBatchIdentities("act_111"), getLiveBatchIdentities("act_111")]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await getLiveBatchIdentities("act_111", true);
    expect(fetcher).toHaveBeenCalledTimes(4);
    await getLiveBatchIdentities("act_222");
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "rotated");
    await getLiveBatchIdentities("act_111");
    expect(fetcher).toHaveBeenCalledTimes(8);
    vi.advanceTimersByTime(60_001);
    await getLiveBatchIdentities("act_111");
    expect(fetcher).toHaveBeenCalledTimes(10);
  });
  it("does not cache permission errors as empty successful lists", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: "Permission denied" } }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchIdentities } = await import("@/lib/meta/batch-identities");
    await expect(getLiveBatchIdentities("act_111")).rejects.toThrow("Permission denied");
    fetcher.mockImplementation(async () => Response.json({ data: [] }));
    expect(await getLiveBatchIdentities("act_111")).toEqual({ pages: [], instagramAccounts: [] });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
