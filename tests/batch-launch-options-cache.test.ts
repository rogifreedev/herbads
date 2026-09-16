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

describe("short-lived Meta picker cache", () => {
  it("deduplicates concurrent requests and expires after one minute", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchOptions } = await import("@/lib/meta/batch-launch");
    await Promise.all([getLiveBatchOptions("act_111"), getLiveBatchOptions("act_111")]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await getLiveBatchOptions("act_111");
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_001);
    await getLiveBatchOptions("act_111");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("isolates accounts and token rotations", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchOptions } = await import("@/lib/meta/batch-launch");
    await getLiveBatchOptions("act_111");
    await getLiveBatchOptions("act_222");
    vi.stubEnv("META_SYSTEM_USER_ACCESS_TOKEN", "rotated-token");
    await getLiveBatchOptions("act_111");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("does not cache failures and allows an immediate retry", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: { message: "Temporarily unavailable" } }, { status: 503 })
    );
    vi.stubGlobal("fetch", fetcher);
    const { getLiveBatchOptions } = await import("@/lib/meta/batch-launch");
    await expect(getLiveBatchOptions("act_111")).rejects.toThrow("Temporarily unavailable");
    fetcher.mockImplementation(async () => Response.json({ data: [] }));
    await expect(getLiveBatchOptions("act_111")).resolves.toEqual({ campaigns: [], templates: [] });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
