import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), locales: vi.fn() }));
vi.mock("@/lib/batch-launch", () => ({ launchAccount: mocks.account }));
vi.mock("@/lib/meta/batch-locales", () => ({ getBatchLocales: mocks.locales }));
import { GET } from "@/app/api/clients/[clientId]/batches/locales/route";
const context = { params: Promise.resolve({ clientId: "client" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue({});
  mocks.locales.mockResolvedValue([{ id: 5, name: "Deutsch" }]);
});
describe("language lookup route", () => {
  it("authorizes the account before resolving selected language IDs", async () => {
    const response = await GET(
      new Request("https://example.com/locales?accountId=account&ids=5,4,5&language=it"),
      context
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.account).toHaveBeenCalledWith("client", "account");
    expect(mocks.locales).toHaveBeenCalledWith("", "it", [5, 4]);
  });
  it("rejects foreign accounts before any catalog access", async () => {
    mocks.account.mockRejectedValue(new Error("Foreign account"));
    const response = await GET(new Request("https://example.com/locales?accountId=foreign&ids=5"), context);
    expect(response.status).toBe(400);
    expect(mocks.locales).not.toHaveBeenCalled();
  });
  it.each(["", "0", "-1", "5oops", "5.5", "9007199254740992", Array.from({ length: 51 }, (_, i) => i + 1).join(",")])(
    "rejects invalid IDs: %s",
    async (ids) => {
      const response = await GET(new Request(`https://example.com/locales?accountId=account&ids=${ids}`), context);
      expect(response.status).toBe(400);
      expect(mocks.locales).not.toHaveBeenCalled();
    }
  );
});
