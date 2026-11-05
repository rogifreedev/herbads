import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  meta: vi.fn(),
  media: vi.fn(),
  insert: vi.fn(),
  existing: vi.fn(),
  identities: vi.fn()
}));
let storedCurrency: string | null;
let storedCampaignStatus: string;
let storedTemplate: typeof template;
vi.mock("@/lib/meta/batch-identities", () => ({ getLiveBatchIdentities: mocks.identities }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-drive", () => ({ listBatchMedia: mocks.media }));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  metaLaunchRequest: mocks.meta
}));
import { createBatchLaunch, saveLaunchPreset, mapLaunchJob, type BatchLaunchJobRow } from "@/lib/batch-launch";
import { campaign, feed, story, launchInput, template } from "./batch-launch-fixtures";

beforeEach(() => {
  storedCurrency = "EUR";
  storedCampaignStatus = "ACTIVE";
  storedTemplate = structuredClone(template);
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
    if (path.startsWith("act_111?")) return { id: "act_111", account_id: "111", currency: "USD", name: "US" };
    if (path.startsWith(`${campaign.id}?`)) return { ...campaign, account_id: "111" };
    if (path.startsWith(`${template.id}?`)) return { ...template, status: "PAUSED", campaign_id: "other" };
    return { success: true };
  });
  mocks.database.mockReturnValue({
    from(table: string) {
      let inserted: Partial<BatchLaunchJobRow> = {};
      const query = {
        update(value: { currency: string }) {
          if (table === "meta_ad_accounts") storedCurrency = value.currency;
          return query;
        },
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        limit() {
          return query;
        },
        order() {
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          const data =
            table === "meta_campaigns"
              ? [{ meta_campaign_id: campaign.id, name: campaign.name, objective: campaign.objective, status: storedCampaignStatus, raw: campaign }]
              : table === "meta_ad_sets"
                ? [{ meta_adset_id: template.id, name: "Template", raw: storedTemplate }]
                : mocks.existing();
          return Promise.resolve({ data, error: null }).then(resolve);
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
              ? { id: "account", client_id: "client", meta_account_id: "act_111", currency: storedCurrency }
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
  it("resolves null account currency before converting a USD budget to cents", async () => {
    storedCurrency = null;
    await createBatchLaunch("client", { ...launchInput, settings: { ...launchInput.settings, dailyBudget: "15.01" } });
    expect(storedCurrency).toBe("USD");
    expect(mocks.insert.mock.calls[0][0].payload.adsetPayload.daily_budget).toBe(1501);
    expect(mocks.meta).toHaveBeenCalledWith("act_111?fields=id,account_id,name,currency");
  });
  it("does not validate or queue a Meta launch if its currency cannot be resolved", async () => {
    storedCurrency = null;
    mocks.meta.mockRejectedValue(new Error("Unavailable"));
    await expect(createBatchLaunch("client", launchInput)).rejects.toThrow(/Kontowaehrung/);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.meta.mock.calls.every(([, body]) => body === undefined)).toBe(true);
  });
  it("uses the resolved currency for account preset budget validation as well", async () => {
    storedCurrency = null;
    await saveLaunchPreset("client", "account", { ...launchInput.settings, id: "", name: "USD preset", dailyBudget: "15.01" });
    expect(storedCurrency).toBe("USD");
    expect(mocks.insert.mock.calls[0][0].settings.dailyBudget).toBe("15.01");
    expect(mocks.meta.mock.calls.every(([, body]) => body === undefined)).toBe(true);
  });
  it("normalizes synchronized targeting and leaves live validation to the queue worker", async () => {
    const raw = {
      ...template,
      targeting: { ...template.targeting, age_min: 40, age_range: [18, 65] }
    };
    storedTemplate = raw;
    await createBatchLaunch("client", launchInput);
    const queued = mocks.insert.mock.calls[0][0].payload.adsetPayload;
    expect(queued.targeting).not.toHaveProperty("age_range");
    expect(queued.targeting).toMatchObject({ age_min: 40, age_max: 65, targeting_automation: { advantage_audience: 0 } });
    expect(queued.status).toBe("PAUSED");
    expect(queued).not.toHaveProperty("execution_options");
    expect(raw.targeting.age_range).toEqual([18, 65]);
    expect(mocks.meta).not.toHaveBeenCalled();
  });
  it("queues from synchronized settings without spending Meta calls on duplicate preflight", async () => {
    const job = await createBatchLaunch("client", launchInput);
    expect(job.status).toBe("pending");
    expect(mocks.meta).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        queue_enabled: true,
        state: { media: {}, ads: {}, step: "validation", validated: false }
      })
    );
  });
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
  it.each(["pageId", "instagramId"] as const)("queues %s for serialized worker validation", async (field) => {
    await createBatchLaunch("client", { ...launchInput, copy: { ...launchInput.copy, [field]: "999999" } });
    expect(mocks.identities).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.meta).not.toHaveBeenCalled();
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
  it("plans five ads for a matched pair, keeps two unique uploads and ignores client description overrides", async () => {
    mocks.media.mockResolvedValue({ files: [feed, story] });
    const descriptions = Array.from({ length: 5 }, (_, i) => `Description ${i + 1}`);
    const job = await createBatchLaunch("client", {
      ...launchInput,
      copy: { ...launchInput.copy, descriptions },
      groups: [{ id: "pair", name: "Motif", feedFileId: feed.id, storyFileId: story.id, description: "Untrusted" }]
    });
    const payload = mocks.insert.mock.calls[0][0].payload;
    expect(payload.descriptionVariantsExpanded).toBe(true);
    expect(payload.input.groups.map((group: { description: string }) => group.description)).toEqual(descriptions);
    expect(payload.input.groups).toHaveLength(5);
    expect(payload.files).toEqual([feed, story]);
    expect(job.adCount).toBe(5);
    expect(job.fileCount).toBe(2);
  });
  it("still rejects manually reused media before expanding description variants", async () => {
    await expect(createBatchLaunch("client", {
      ...launchInput,
      copy: { ...launchInput.copy, descriptions: ["One", "Two"] },
      groups: [
        { id: "one", name: "One", feedFileId: feed.id, storyFileId: null },
        { id: "two", name: "Two", feedFileId: feed.id, storyFileId: null }
      ]
    })).rejects.toThrow(/mehrfach zugeordnet/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each(["2026-09-15T22:30:00Z", "2026-12-31T23:30:00Z"])("uses only the authoritative folder name on %s", async (date) => {
    vi.setSystemTime(new Date(date));
    const job = await createBatchLaunch("client", { ...launchInput, name: "16.09.2026_01_Batch" });
    const name = "01_Batch";
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
    expect(mocks.meta).not.toHaveBeenCalled();
    expect(launchInput.name).toBe("Batch 01");
  });
  it("preserves the original name of an existing job", () => {
    const row = { ...previous("running"), name: "16.09.2026_01_Batch" };
    expect(mapLaunchJob(row).name).toBe("16.09.2026_01_Batch");
  });
  it.each(["PAUSED", "ARCHIVED", "DELETED"])(
    "rejects a destination that is now %s before any write",
    async (status) => {
      storedCampaignStatus = status;
      await expect(createBatchLaunch("client", launchInput)).rejects.toThrow(/nicht mehr aktiv/);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.meta).not.toHaveBeenCalled();
    }
  );
});
