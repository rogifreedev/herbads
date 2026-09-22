import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  meta: vi.fn(),
  media: vi.fn(),
  insert: vi.fn(),
  existing: vi.fn(),
  identities: vi.fn()
}));
vi.mock("@/lib/meta/batch-identities", () => ({ getLiveBatchIdentities: mocks.identities }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-drive", () => ({ listBatchMedia: mocks.media }));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  metaLaunchRequest: mocks.meta
}));
import { createBatchLaunch, mapLaunchJob, type BatchLaunchJobRow } from "@/lib/batch-launch";
import { campaign, feed, launchInput, template } from "./batch-launch-fixtures";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReset();
  mocks.existing.mockReset();
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
        order() {
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: mocks.existing(), error: null }).then(resolve);
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
          error: table === "batch_launch_jobs" ? (mocks.insert.mock.results.at(-1)?.value ?? null) : null
        })
      };
      return query;
    }
  });
});
afterEach(() => vi.useRealTimers());

describe("batch creation defaults", () => {
  const previous = (status: BatchLaunchJobRow["status"]): BatchLaunchJobRow => ({
    id: status,
    client_id: "client",
    ad_account_id: "account",
    drive_folder_id: "folder",
    meta_campaign_id: campaign.id,
    name: "Old batch",
    status,
    payload: { input: launchInput, files: [feed], metaAccountId: "act_111", campaign, adsetPayload: {} },
    state: { step: "ad", media: {}, ads: { first: { creativeId: "200" } }, adsetId: "100" },
    error: "Choose an Instagram identity",
    updated_at: "2026-09-22T12:00:00Z",
    lease_token: null,
    lease_until: null
  });
  it("returns a whitelisted editable draft without reusing any Meta state or activation", () => {
    const row = previous("cancelled");
    row.payload.input = { ...launchInput, activate: true };
    expect(mapLaunchJob(row).retryDraft).toEqual({
      campaignId: launchInput.campaignId,
      templateId: launchInput.templateId,
      settings: launchInput.settings,
      copy: expect.objectContaining(launchInput.copy)
    });
    expect(mapLaunchJob({ ...row, lease_token: "still-running" }).retryDraft).toBeUndefined();
    expect(mapLaunchJob(previous("review")).retryDraft).toBeUndefined();
  });
  it("returns the blocking attempt, not cancelled history, after a duplicate insert", async () => {
    mocks.insert.mockReturnValue({ code: "23505" });
    mocks.existing.mockReturnValue([previous("cancelled"), previous("pending")]);
    expect((await createBatchLaunch("client", launchInput)).id).toBe("pending");
  });
  it("does not turn an ambiguous cancelled attempt into a fresh draft", async () => {
    mocks.insert.mockReturnValue({ code: "23505" });
    const blocked = previous("cancelled");
    blocked.state.inFlight = "ad:first";
    mocks.existing.mockReturnValue([blocked]);
    expect((await createBatchLaunch("client", launchInput)).retryDraft).toBeUndefined();
  });
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
