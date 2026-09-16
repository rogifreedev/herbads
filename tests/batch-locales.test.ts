import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("Meta language names", () => {
  it("resolves selected IDs across catalog pages and reuses the catalog", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      Response.json(
        url.searchParams.has("after")
          ? { data: [{ key: "4", name: "Italiano" }] }
          : { data: [{ key: "5", name: "Deutsch" }], paging: { next: "next", cursors: { after: "page-2" } } }
      )
    );
    vi.stubGlobal("fetch", fetcher);
    const { getBatchLocales } = await import("@/lib/meta/batch-locales");
    expect(await getBatchLocales("", "de", [5, 4])).toEqual([
      { id: 5, name: "Deutsch" },
      { id: 4, name: "Italiano" }
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0].searchParams.get("type")).toBe("adlocale");
    expect(fetcher.mock.calls[0][0].searchParams.has("q")).toBe(false);
    expect(await getBatchLocales("", "de", [5, 9999])).toEqual([{ id: 5, name: "Deutsch" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60 * 60_000 + 1);
    await getBatchLocales("", "de", [5]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("keeps localized catalogs and token rotations separate", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      Response.json({ data: [{ key: 5, name: url.searchParams.get("locale") === "it_IT" ? "Tedesco" : "Deutsch" }] })
    );
    vi.stubGlobal("fetch", fetcher);
    const { getBatchLocales } = await import("@/lib/meta/batch-locales");
    expect(await getBatchLocales("", "de", [5])).toEqual([{ id: 5, name: "Deutsch" }]);
    expect(await getBatchLocales("", "it", [5])).toEqual([{ id: 5, name: "Tedesco" }]);
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "new-token");
    await getBatchLocales("", "de", [5]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("preserves search and safely encodes its query", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: [
          { key: "5", name: "Deutsch" },
          { key: "NaN", name: "Invalid" }
        ]
      })
    );
    vi.stubGlobal("fetch", fetcher);
    const { getBatchLocales } = await import("@/lib/meta/batch-locales");
    expect(await getBatchLocales("Deu&x=y", "de")).toEqual([{ id: 5, name: "Deutsch" }]);
    const url = (fetcher.mock.calls[0] as unknown as [URL])[0];
    expect(url.searchParams.get("q")).toBe("Deu&x=y");
    expect(url.searchParams.has("x")).toBe(false);
  });
  it("allows an immediate retry after a failed catalog fetch", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: "Unavailable" } }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const { getBatchLocales } = await import("@/lib/meta/batch-locales");
    await expect(getBatchLocales("", "de", [5])).rejects.toThrow("Unavailable");
    fetcher.mockImplementation(async () => Response.json({ data: [{ key: 5, name: "Deutsch" }] }));
    await expect(getBatchLocales("", "de", [5])).resolves.toEqual([{ id: 5, name: "Deutsch" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
