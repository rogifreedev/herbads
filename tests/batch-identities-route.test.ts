import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identities: vi.fn() }));
vi.mock("@/lib/batch-launch", () => ({ getBatchLaunchIdentities: mocks.identities }));
import { GET } from "@/app/api/clients/[clientId]/batches/launch/identities/route";
const context = { params: Promise.resolve({ clientId: "client" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identities.mockResolvedValue({ pages: [], instagramAccounts: [] });
});
describe("identity route", () => {
  it("passes account ownership and explicit refresh through without caching the private response", async () => {
    const response = await GET(new Request("https://example.com/identities?accountId=account&refresh=1"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.identities).toHaveBeenCalledWith("client", "account", true);
  });
  it("returns an actionable error instead of treating access failure as no pages", async () => {
    mocks.identities.mockRejectedValue(new Error("Access denied"));
    const response = await GET(new Request("https://example.com/identities?accountId=foreign"), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Access denied" });
  });
});
