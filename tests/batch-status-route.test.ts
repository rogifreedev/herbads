import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/batch-status", () => ({ refreshBatchMetaStatuses: mocks.refresh }));
import { POST } from "@/app/api/clients/[clientId]/batches/status/route";
const context = { params: Promise.resolve({ clientId: "client" }) };
beforeEach(() => vi.resetAllMocks());

describe("batch status route", () => {
  it("refreshes only the requested client and prevents response caching", async () => {
    const result = { changed: true, checked: 2, unavailable: 0, checkedAt: "2026-10-02T10:00:00Z" };
    mocks.refresh.mockResolvedValue(result);
    const response = await POST(new Request("https://example.com/api/status", { method: "POST", headers: { origin: "https://example.com" } }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(result);
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith("client");
  });
  it("rejects cross-origin requests before reading provider data", async () => {
    const response = await POST(new Request("https://example.com/api/status", { method: "POST", headers: { origin: "https://foreign.example" } }), context);
    expect(response.status).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("returns a failure instead of success or provider credentials", async () => {
    mocks.refresh.mockRejectedValue(new Error("Provider error containing secret token"));
    const response = await POST(new Request("https://example.com/api/status", { method: "POST" }), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Meta-Status konnte nicht aktualisiert werden." });
  });
});
