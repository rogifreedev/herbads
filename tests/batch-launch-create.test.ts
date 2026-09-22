import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  meta: vi.fn(),
  media: vi.fn(),
  insert: vi.fn(),
  identities: vi.fn()
}));
vi.mock("@/lib/meta/batch-identities", () => ({ getLiveBatchIdentities: mocks.identities }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-drive", () => ({ listBatchMedia: mocks.media }));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  metaLaunchRequest: mocks.meta
}));
import { createBatchLaunch, type BatchLaunchJobRow } from "@/lib/batch-launch";
import { campaign, feed, launchInput, template } from "./batch-launch-fixtures";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T22:30:00Z"));
  mocks.media.mockResolvedValue({ files: [feed] });
  mocks.identities.mockResolvedValue({
    pages: [{ id: launchInput.copy.pageId, name: "Page" }],
    instagramAccounts: [{ id: launchInput.copy.instagramId, name: "Instagram" }]
  });
  mocks.meta.mockImplementation(async (path: string) => {
    if (path.startsWith(`${campaign.id}?`)) return { ...campaign, account_id: "111" };
    if (path.startsWith(`${template.id}?`)) return { ...template, status: "PAUSED", campaign_id: "other" };
    return { success: true };
  });
  mocks.database.mockReturnValue({
    from(table: string) {
      let inserted: Partial<BatchLaunchJobRow> = {};
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        limit() {
          return query;
        },
        insert(value: Partial<BatchLaunchJobRow>) {
          inserted = value;
          mocks.insert(value);
          return query;
        },
        maybeSingle: async () => ({ data: { drive_folder_id: "folder", name: "01_Batch" }, error: null }),
        single: async () => ({
          data:
            table === "meta_ad_accounts"
              ? { id: "account", client_id: "client", meta_account_id: "act_111", currency: "EUR" }
              : { ...inserted, id: "job", status: "pending", state: {}, updated_at: new Date().toISOString() },
          error: null
        })
      };
      return query;
    }
  });
});
afterEach(() => vi.useRealTimers());

describe("batch creation defaults", () => {
  it.each(["pageId", "instagramId"] as const)("rejects an identity outside this account: %s", async (field) => {
    await expect(
      createBatchLaunch("client", { ...launchInput, copy: { ...launchInput.copy, [field]: "999999" } })
    ).rejects.toThrow(/Werbekonto nicht verfuegbar/);
    expect(mocks.identities).toHaveBeenCalledWith("act_111", true);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.meta.mock.calls.every(([, body]) => body === undefined)).toBe(true);
  });
  it("persists every variant with canonical scalar fallbacks for the resumable worker", async () => {
    const copy = {
      ...launchInput.copy,
      primaryTexts: ["", "Second body", "Third body"],
      headlines: ["New title", "Second title"],
      descriptions: ["", "Description"]
    };
    await createBatchLaunch("client", { ...launchInput, copy });
    expect(mocks.insert.mock.calls[0][0].payload.input.copy).toMatchObject({
      primaryText: "Second body",
      primaryTexts: ["Second body", "Third body"],
      headline: "New title",
      headlines: ["New title", "Second title"],
      description: "Description",
      descriptions: ["Description"]
    });
    expect(copy.primaryTexts).toEqual(["", "Second body", "Third body"]);
  });
  it("uses the server date and authoritative folder name for validation, persistence and Meta", async () => {
    const job = await createBatchLaunch("client", { ...launchInput, name: "untrusted or stale browser name" });
    const name = "16.09.2026_01_Batch";
    expect(job.name).toBe(name);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name,
        payload: expect.objectContaining({
          input: expect.objectContaining({ name }),
          adsetPayload: expect.objectContaining({ name, status: "PAUSED", campaign_id: campaign.id })
        })
      })
    );
    expect(mocks.meta).toHaveBeenLastCalledWith(
      "act_111/adsets",
      expect.objectContaining({
        name,
        status: "PAUSED",
        execution_options: ["validate_only"]
      })
    );
    expect(launchInput.name).toBe("Batch 01");
  });
  it.each(["PAUSED", "ARCHIVED", "DELETED"])(
    "rejects a destination that is now %s before any write",
    async (status) => {
      mocks.meta.mockImplementation(async (path: string) =>
        path.startsWith(`${campaign.id}?`) ? { ...campaign, status, account_id: "111" } : template
      );
      await expect(createBatchLaunch("client", launchInput)).rejects.toThrow(/nicht mehr aktiv/);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.meta.mock.calls.every(([, body]) => body === undefined)).toBe(true);
    }
  );
});
