import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchLaunchJobRow } from "@/lib/batch-launch";
import { campaign, feed, story, launchInput, template } from "./batch-launch-fixtures";
import { buildAdSetPayload } from "@/lib/batch-launch-plan";
import { normalizeBatchCopy } from "@/lib/batch-launch-copy";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  request: vi.fn(),
  download: vi.fn(),
  prepareImage: vi.fn(),
  database: vi.fn(),
  revalidate: vi.fn()
}));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-drive", () => ({ downloadBatchMedia: mocks.download }));
vi.mock("@/lib/batch-image-upload", () => ({ prepareBatchImage: mocks.prepareImage }));
vi.mock("@/lib/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/batch-launch")>()),
  getBatchLaunchJob: mocks.getJob
}));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  metaLaunchRequest: mocks.request
}));
vi.mock("@/lib/cache-tags", () => ({ BATCH_CACHE_TAGS: ["batch"], revalidateCacheTags: mocks.revalidate }));
import { processBatchLaunch as processQueuedBatchLaunch } from "@/lib/batch-launch-worker";
const processBatchLaunch = (clientId: string, jobId: string) =>
  processQueuedBatchLaunch(clientId, jobId, "queue-token");
import { MetaLaunchError } from "@/lib/meta/batch-launch";

let row: BatchLaunchJobRow;
let writes: { table: string; values: Record<string, unknown> }[];

beforeEach(() => {
  vi.clearAllMocks();
  row = {
    id: "job",
    client_id: "client",
    ad_account_id: "account",
    drive_folder_id: "folder",
    meta_campaign_id: campaign.id,
    name: launchInput.name,
    status: "pending",
    payload: {
      input: structuredClone(launchInput),
      files: [feed],
      metaAccountId: "act_111",
      campaign,
      adsetPayload: buildAdSetPayload(launchInput.name, campaign, template, launchInput.settings, "EUR")
    },
    state: { media: {}, ads: {}, step: "adset", validated: true },
    error: null,
    lease_token: null,
    lease_until: null,
    updated_at: new Date().toISOString()
  };
  writes = [];
  mocks.getJob.mockImplementation(async (clientId, jobId) => {
    if (clientId !== row.client_id || jobId !== row.id) throw new Error("Not found");
    return structuredClone(row);
  });
  mocks.database.mockImplementation(() => ({
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "claim_batch_upload_step")
        return {
          maybeSingle: async () => {
            if (row.lease_until && Date.parse(row.lease_until) > Date.now()) return { data: null, error: null };
            row = {
              ...row,
              status: "running",
              error: null,
              lease_token: String(args.p_token),
              lease_until: new Date(Date.now() + 180000).toISOString()
            };
            return { data: structuredClone(row), error: null };
          }
        };
      if (name === "persist_batch_upload_step") {
        if (args.p_token !== row.lease_token) return Promise.resolve({ data: false, error: null });
        const status = ["completed", "review", "failed"].includes(String(args.p_status))
          ? args.p_status
          : row.control_status === "pause"
            ? "paused"
            : row.control_status === "cancel"
              ? "cancelled"
              : args.p_status;
        row = {
          ...row,
          state: structuredClone(args.p_state),
          status,
          error: args.p_error,
          ...(args.p_release ? { lease_token: null, lease_until: null } : {})
        } as BatchLaunchJobRow;
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "defer_batch_upload_step") {
        if (args.p_token !== row.lease_token) return Promise.resolve({ data: false, error: null });
        row = {
          ...row,
          state: structuredClone(args.p_state) as BatchLaunchJobRow["state"],
          status: "pending",
          error: String(args.p_error),
          retry_after: String(args.p_retry_after),
          retry_count: (row.retry_count ?? 0) + 1,
          lease_token: null,
          lease_until: null
        };
        return Promise.resolve({ data: true, error: null });
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from(table: string) {
      let values: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const apply = () => {
        writes.push({ table, values: structuredClone(values) });
        if (table === "batch_launch_jobs") row = { ...row, ...structuredClone(values) } as BatchLaunchJobRow;
        return { data: table === "batch_launch_jobs" ? structuredClone(row) : { id: `${table}-id` }, error: null };
      };
      const query = {
        update(input: Record<string, unknown>) {
          values = input;
          return query;
        },
        upsert(input: Record<string, unknown>) {
          values = input;
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        in() {
          return query;
        },
        or() {
          return query;
        },
        select() {
          return query;
        },
        async maybeSingle() {
          if (row.lease_until && Date.parse(row.lease_until) > Date.now()) return { data: null, error: null };
          return apply();
        },
        async single() {
          if (
            table === "batch_launch_jobs" &&
            (filters.lease_token !== row.lease_token || filters.client_id !== row.client_id)
          )
            throw new Error("Lease lost");
          return apply();
        },
        then(resolve: (value: ReturnType<typeof apply>) => unknown) {
          return Promise.resolve(apply()).then(resolve);
        }
      };
      return query;
    }
  }));
  mocks.download.mockResolvedValue(Buffer.from("file"));
  mocks.prepareImage.mockResolvedValue({ bytes: Buffer.from("optimized image"), name: "Motif_1_1x1.jpg" });
  mocks.request.mockImplementation(async (path: string, values?: Record<string, unknown>) =>
    path.includes("?fields=status,daily_budget")
      ? { status: "ACTIVE" }
      : path === "100?fields=status"
        ? { status: "PAUSED" }
        : path.endsWith("/ads")
          ? { id: "300" }
          : values?.status === "ACTIVE"
            ? { success: true }
            : path.endsWith("/adimages")
              ? { images: { image: { hash: "hash" } } }
              : { id: path.endsWith("/adsets") ? "100" : "200" }
  );
});

describe("resumable paused batch worker", () => {
  it.each(["paused", "cancelled", "failed"] as const)("never automatically processes a %s job", async (status) => {
    row.status = status;
    expect((await processBatchLaunch("client", "job")).status).toBe(status);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves a pause requested while a Meta write is already in flight", async () => {
    mocks.request.mockImplementationOnce(async () => {
      row.control_status = "pause";
      return { id: "100" };
    });
    expect((await processBatchLaunch("client", "job")).status).toBe("paused");
    expect(row.state.adsetId).toBe("100");
    expect(row.state.inFlight).toBeUndefined();
    await processBatchLaunch("client", "job");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("creates one active ad with all 15 text variants and retains them in the stored creative", async () => {
    row.payload.input.copy = normalizeBatchCopy({
      ...row.payload.input.copy,
      primaryTexts: Array.from({ length: 5 }, (_, i) => `Body ${i}`),
      headlines: Array.from({ length: 5 }, (_, i) => `Title ${i}`),
      descriptions: Array.from({ length: 5 }, (_, i) => `Description ${i}`)
    });
    for (let i = 0; i < 8; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    const creativeCalls = mocks.request.mock.calls.filter(([path]) => path.endsWith("/adcreatives"));
    const adCalls = mocks.request.mock.calls.filter(([path]) => path.endsWith("/ads"));
    expect(creativeCalls).toHaveLength(1);
    expect(adCalls).toHaveLength(1);
    expect(adCalls[0][1].status).toBe("ACTIVE");
    for (const key of ["bodies", "titles", "descriptions"])
      expect(creativeCalls[0][1].asset_feed_spec[key]).toHaveLength(5);
    expect(writes.find((write) => write.table === "creatives")?.values).toMatchObject({
      body: "Body 0",
      title: "Title 0",
      raw: creativeCalls[0][1]
    });
  });
  function pairedDescriptionJob() {
    row.payload.input.copy = normalizeBatchCopy({
      ...row.payload.input.copy,
      primaryTexts: Array.from({ length: 5 }, (_, i) => `Body ${i + 1}`),
      headlines: Array.from({ length: 5 }, (_, i) => `Title ${i + 1}`),
      descriptions: Array.from({ length: 5 }, (_, i) => `Description ${i + 1}`)
    });
    row.payload.files = Array.from({ length: 3 }, (_, i) => [
      { ...feed, id: `feed-${i}` }, { ...story, id: `story-${i}` }
    ]).flat();
    row.payload.input.groups = Array.from({ length: 3 }, (_, i) => ({
      id: `motif-${i}`, name: `100_V${i + 1}`, feedFileId: `feed-${i}`, storyFileId: `story-${i}`
    }));
    row.state.adsetId = "100";
    row.state.step = "creative";
    row.state.media = Object.fromEntries(row.payload.files.map((file) => [file.id, { imageHash: `hash-${file.id}` }]));
    row.state.ads = { "motif-0": {} };
  }
  it.each([false, true])(
    "resumes three uploaded pairs into 15 description variants without reuploading or duplicates (activate=%s)",
    async (activate) => {
      pairedDescriptionJob();
      row.payload.input.activate = activate;
      row.status = "failed";
      const originalMedia = structuredClone(row.state.media);
      await processBatchLaunch("client", "job");
      expect(writes).toHaveLength(0);
      expect(row.payload.input.groups).toHaveLength(3);
      row.status = "pending"; // Explicit resume of the rejected job.
      let adCount = 0;
      let creativeCount = 0;
      mocks.request.mockImplementation(async (path: string, values?: Record<string, unknown>) => {
        if (path.endsWith("/adcreatives")) return { id: String(200 + ++creativeCount) };
        if (path.endsWith("/ads")) {
          expect(values?.status).toBe("ACTIVE");
          expect(row.state.activated).not.toBe(true);
          return { id: String(300 + ++adCount) };
        }
        if (path === "100?fields=status") return { status: "PAUSED" };
        if (path.includes("?fields=status,daily_budget")) return { status: "ACTIVE" };
        if (path === "100" && values?.status === "ACTIVE") {
          expect(adCount).toBe(15);
          return { success: true };
        }
        throw new Error(`Unexpected request: ${path}`);
      });
      expect((await processBatchLaunch("client", "job")).adCount).toBe(15);
      row.status = "paused";
      await processBatchLaunch("client", "job");
      expect(creativeCount).toBe(1);
      row.status = "pending";
      for (let i = 0; i < 45; i++) {
        if ((await processBatchLaunch("client", "job")).status === "completed") break;
      }
      expect(row.status).toBe("completed");
      expect(row.payload.input.activate).toBe(activate);
      expect(Boolean(row.state.activated)).toBe(activate);
      expect(row.state.media).toEqual(originalMedia);
      expect(mocks.prepareImage).not.toHaveBeenCalled();
      expect(mocks.download).not.toHaveBeenCalled();
      expect(creativeCount).toBe(15);
      expect(adCount).toBe(15);
      expect(Object.values(row.state.ads).filter((ad) => ad.adId)).toHaveLength(15);
      expect(row.state.savedAdIds).toHaveLength(15);
      expect(writes.filter((write) => write.table === "batch_launch_jobs")).toHaveLength(1);
      const creatives = mocks.request.mock.calls.filter(([path]) => path.endsWith("/adcreatives")).map(([, body]) => body);
      for (const [index, creative] of creatives.entries()) {
        expect(creative.name).toBe(`100_V${Math.floor(index / 5) + 1} - D${index % 5 + 1}`);
        expect(creative.asset_feed_spec.bodies).toHaveLength(5);
        expect(creative.asset_feed_spec.titles).toHaveLength(5);
        expect(creative.asset_feed_spec.descriptions).toEqual([
          { text: `Description ${index % 5 + 1}`, adlabels: [{ name: "batch_descriptions" }] }
        ]);
        expect(creative.asset_feed_spec.images.map((image: { hash: string }) => image.hash)).toEqual([
          `hash-feed-${Math.floor(index / 5)}`, `hash-story-${Math.floor(index / 5)}`
        ]);
      }
      expect(writes.filter((write) => write.table === "creatives").map((write) => write.values.raw)).toEqual(creatives);
      await processBatchLaunch("client", "job");
      expect(adCount).toBe(15);
    }
  );
  it.each([{ creativeId: "200" }, { adId: "300" }])("does not replan existing Meta objects: %j", async (existing) => {
    pairedDescriptionJob();
    row.state.ads["motif-0"] = existing;
    expect((await processBatchLaunch("client", "job")).status).toBe("failed");
    expect(row.error).toMatch(/bereits Meta-Objekte/);
    expect(row.payload.input.groups).toHaveLength(3);
    expect(writes).toHaveLength(0);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not replan or replay an ambiguous creative write", async () => {
    pairedDescriptionJob();
    row.state.inFlight = "creative:motif-0";
    expect((await processBatchLaunch("client", "job")).status).toBe("review");
    expect(row.payload.input.groups).toHaveLength(3);
    expect(writes).toHaveLength(0);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not create anything if saving the expanded plan fails", async () => {
    pairedDescriptionJob();
    const db = mocks.database.getMockImplementation()!();
    const from = db.from;
    db.from = (table: string) => {
      const query = from(table);
      if (table === "batch_launch_jobs")
        query.single = async () => ({ data: null, error: { message: "Lease lost" } });
      return query;
    };
    mocks.database.mockReturnValueOnce(db);
    expect((await processBatchLaunch("client", "job")).status).toBe("failed");
    expect(row.error).toMatch(/Varianten|varianten/);
    expect(row.payload.input.groups).toHaveLength(3);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("creates every ad active before enabling the parent last", async () => {
    row.payload.input.activate = true;
    row.payload.files.push({ ...feed, id: "second" });
    row.payload.input.groups.push({ id: "ad-2", name: "Second", feedFileId: "second", storyFileId: null });
    let adCount = 0;
    mocks.request.mockImplementation(async (path: string, values?: Record<string, unknown>) => {
      if (path === "100?fields=status") return { status: "PAUSED" };
      if (path.endsWith("/ads")) {
        expect(values?.status).toBe("ACTIVE");
        expect(row.state.activated).not.toBe(true);
        return { id: String(300 + ++adCount) };
      }
      if (values?.status === "ACTIVE") {
        expect(adCount).toBe(2);
        return { success: true };
      }
      if (path.includes("?fields=status,daily_budget")) return { status: "ACTIVE" };
      if (path.endsWith("/adimages")) return { images: { image: { hash: "hash" } } };
      return { id: path.endsWith("/adsets") ? "100" : "200" };
    });
    for (let i = 0; i < 11; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(mocks.request.mock.calls.filter(([, values]) => values?.status === "ACTIVE").map(([path]) => path)).toEqual([
      "act_111/ads",
      "act_111/ads",
      "100"
    ]);
  });
  it("creates active ads in the paused adset and activates only the new parent on request", async () => {
    row.payload.input.activate = true;
    for (let i = 0; i < 7; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(row.state.activated).toBe(true);
    const calls = mocks.request.mock.calls;
    expect(calls.find(([path]) => path.endsWith("/adsets"))?.[1].status).toBe("PAUSED");
    expect(calls.find(([path]) => path.endsWith("/ads"))?.[1].status).toBe("ACTIVE");
    expect(calls.filter(([, values]) => values?.status === "ACTIVE").map(([path]) => path)).toEqual([
      "act_111/ads", "100"
    ]);
    expect(calls.some(([path, values]) => path === campaign.id && values)).toBe(false);
    expect(writes.find((write) => write.table === "batch_folder_checks")?.values).toMatchObject({
      status: "live",
      match_status: "ACTIVE"
    });
    expect(writes.find((write) => write.table === "meta_ads")?.values).toMatchObject({
      status: "ACTIVE",
      effective_status: "ACTIVE"
    });
  });
  it("does not activate any object when media upload fails", async () => {
    row.payload.input.activate = true;
    await processBatchLaunch("client", "job");
    mocks.prepareImage.mockRejectedValueOnce(new Error("Image preparation failed"));
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.error).toBe("Image preparation failed");
    expect(mocks.request.mock.calls.some(([path]) => path.endsWith("/adimages"))).toBe(false);
    expect(mocks.request.mock.calls.some(([, values]) => values?.status === "ACTIVE")).toBe(false);
  });
  it("uploads the prepared image with its actual format and persists its hash", async () => {
    row.state.adsetId = "100";
    await processBatchLaunch("client", "job");
    expect(mocks.prepareImage).toHaveBeenCalledWith(feed, "client");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith("act_111/adimages", {
      bytes: Buffer.from("optimized image").toString("base64"),
      name: "Motif_1_1x1.jpg"
    });
    expect(row.state.media.feed.imageHash).toBe("hash");
  });
  it("stops if the campaign is paused before the final activation", async () => {
    row.payload.input.activate = true;
    for (let i = 0; i < 4; i++) await processBatchLaunch("client", "job");
    mocks.request.mockResolvedValueOnce({ status: "PAUSED" });
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.state.activationStarted).toBeUndefined();
    expect(mocks.request.mock.calls.some(([path, values]) => path === "100" && values?.status === "ACTIVE")).toBe(
      false
    );
  });
  it("stops if the campaign budget changes during the upload", async () => {
    row.payload.input.activate = true;
    for (let i = 0; i < 4; i++) await processBatchLaunch("client", "job");
    mocks.request.mockResolvedValueOnce({ status: "ACTIVE", daily_budget: "99999" });
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/Budget|budget/);
    expect(row.state.activationStarted).toBeUndefined();
  });
  it("retries an uncertain activation on the same ID without creating more objects", async () => {
    row.payload.input.activate = true;
    for (let i = 0; i < 4; i++) await processBatchLaunch("client", "job");
    mocks.request
      .mockResolvedValueOnce({ status: "ACTIVE" })
      .mockRejectedValueOnce(new MetaLaunchError("Timeout", true));
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.state.activationStarted).toBe(true);
    expect(row.state.inFlight).toBeUndefined();
    row.status = "pending"; // Explicit resume after the failed activation.
    await processBatchLaunch("client", "job");
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(mocks.request.mock.calls.filter(([path]) => path.endsWith("/adsets"))).toHaveLength(1);
    expect(
      mocks.request.mock.calls.filter(([path, values]) => path === "100" && values?.status === "ACTIVE")
    ).toHaveLength(2);
  });
  it("creates one paused adset and one active ad without enabling delivery by default", async () => {
    for (let i = 0; i < 5; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(row.state.ads["ad-1"]).toEqual({ creativeId: "200", adId: "300", activated: true });
    expect(mocks.request.mock.calls.filter(([path]) => path.endsWith("/adsets"))).toHaveLength(1);
    expect(mocks.request.mock.calls.find(([path]) => path.endsWith("/adsets"))?.[1]).toHaveProperty("status", "PAUSED");
    expect(mocks.request.mock.calls.find(([path]) => path.endsWith("/ads"))?.[1]).toMatchObject({
      status: "ACTIVE",
      adset_id: "100"
    });
    expect(row.state.activated).toBeUndefined();
    expect(row.state.activationStarted).toBeUndefined();
    expect(mocks.request.mock.calls.some(([path, values]) => path === "100" && values)).toBe(false);
    expect(writes.find((write) => write.table === "meta_ads")?.values).toMatchObject({
      status: "ACTIVE",
      effective_status: "ADSET_PAUSED"
    });
    expect(writes.find((write) => write.table === "meta_ad_sets")?.values).toMatchObject({
      status: "PAUSED",
      effective_status: "PAUSED"
    });
    expect(writes.find((write) => write.table === "batch_folder_checks")?.values).toMatchObject({
      status: "found",
      match_status: "PAUSED"
    });
    expect(row.lease_token).toBeNull();
    await processBatchLaunch("client", "job");
    expect(mocks.request).toHaveBeenCalledTimes(5);
  });
  it("pauses a job-created active adset before creating its first active ad", async () => {
    for (let i = 0; i < 3; i++) await processBatchLaunch("client", "job");
    mocks.request
      .mockResolvedValueOnce({ status: "ACTIVE" })
      .mockResolvedValueOnce({ success: true });
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("running");
    expect(row.state.step).toBe("pausing");
    expect(row.state.ads["ad-1"].adId).toBeUndefined();
    mocks.request.mockResolvedValueOnce({ status: "PAUSED" }).mockResolvedValueOnce({ id: "300" });
    await processBatchLaunch("client", "job");
    expect(row.state.ads["ad-1"]).toMatchObject({ adId: "300", activated: true });
    expect(mocks.request.mock.calls.some(([path, values]) => path === "100" && values?.status === "PAUSED")).toBe(
      true
    );
  });
  it.each(["ARCHIVED", undefined])("stops before creating an active ad if its parent is %s", async (status) => {
    for (let i = 0; i < 3; i++) await processBatchLaunch("client", "job");
    mocks.request.mockResolvedValueOnce({ status });
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/Adset.*pausiert/);
    expect(row.state.inFlight).toBeUndefined();
    expect(mocks.request.mock.calls.some(([path]) => path.endsWith("/ads"))).toBe(false);
    expect(row.state.ads["ad-1"].activated).toBeUndefined();
  });
  it("does not write an active ad after the parent status lookup fails", async () => {
    for (let i = 0; i < 3; i++) await processBatchLaunch("client", "job");
    mocks.request.mockRejectedValueOnce(new MetaLaunchError("Status unavailable", false));
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.state.inFlight).toBeUndefined();
    expect(mocks.request.mock.calls.some(([path]) => path.endsWith("/ads"))).toBe(false);
  });
  it("requires review after an uncertain active-ad creation without duplicating the ad", async () => {
    for (let i = 0; i < 3; i++) await processBatchLaunch("client", "job");
    mocks.request
      .mockResolvedValueOnce({ status: "PAUSED" })
      .mockRejectedValueOnce(new MetaLaunchError("Timeout", true));
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("review");
    expect(row.state.inFlight).toBe("ad:ad-1");
    expect(row.state.ads["ad-1"].activated).toBeUndefined();
    await processBatchLaunch("client", "job");
    expect(mocks.request.mock.calls.filter(([path]) => path.endsWith("/ads"))).toHaveLength(1);
  });
  it.each([false, true])("resumes old paused ads without changing their requested activation (%s)", async (activate) => {
    row.payload.input.activate = activate;
    row.state = {
      validated: true,
      adsetId: "100",
      media: { feed: { imageHash: "hash" } },
      ads: { "ad-1": { creativeId: "200", adId: "300" } },
      step: "ad"
    };
    for (let i = 0; i < 4; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(mocks.request.mock.calls.some(([path]) => path.endsWith("/ads"))).toBe(false);
    expect(mocks.request.mock.calls.filter(([, values]) => values?.status === "ACTIVE").map(([path]) => path)).toEqual(
      activate ? ["300", "100"] : []
    );
    expect(writes.find((write) => write.table === "meta_ads")?.values).toMatchObject({
      status: activate ? "ACTIVE" : "PAUSED",
      effective_status: activate ? "ACTIVE" : "PAUSED"
    });
  });
  it("serializes competing requests through the database lease", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.request.mockImplementationOnce(async () => {
      await wait;
      return { id: "100" };
    });
    const first = processBatchLaunch("client", "job");
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    await processBatchLaunch("client", "job");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(row.state.adsetId).toBe("100");
  });
  it("never recreates an object after a worker died with an in-flight marker", async () => {
    row.state.inFlight = "adset";
    row.lease_until = new Date(Date.now() - 1000).toISOString();
    const result = await processBatchLaunch("client", "job");
    expect(result.status).toBe("review");
    expect(mocks.request).not.toHaveBeenCalled();
    await processBatchLaunch("client", "job");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("requires review after an uncertain Meta creation result", async () => {
    mocks.request.mockRejectedValueOnce(new MetaLaunchError("Timeout", true));
    expect((await processBatchLaunch("client", "job")).status).toBe("review");
    expect(row.state.inFlight).toBe("adset");
    await processBatchLaunch("client", "job");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("allows retry after a definitive rejection", async () => {
    mocks.request.mockRejectedValueOnce(new MetaLaunchError("Invalid parameter", false));
    expect((await processBatchLaunch("client", "job")).status).toBe("failed");
    expect(row.state.inFlight).toBeUndefined();
    row.status = "pending"; // Explicit resume, never an automatic replay of a failed write.
    await processBatchLaunch("client", "job");
    expect(row.state.adsetId).toBe("100");
  });
  it("automatically defers a definitively rejected Meta rate limit", async () => {
    mocks.request.mockRejectedValueOnce(
      new MetaLaunchError("Too many calls from this ad account", false, { code: 80004 })
    );
    const result = await processBatchLaunch("client", "job");
    expect(result.status).toBe("pending");
    expect(result.retryCount).toBe(1);
    expect(Date.parse(result.retryAfter!)).toBeGreaterThan(Date.now());
    expect(row.state.inFlight).toBeUndefined();
    expect(row.error).toMatch(/Automatischer neuer Versuch/);
  });
  it("does not touch Meta for another partner's job", async () => {
    await expect(processBatchLaunch("foreign-client", "job")).rejects.toThrow("Not found");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("resumes the video chunk offset returned by Meta", async () => {
    row.state.adsetId = "100";
    row.payload.files = [{ ...feed, kind: "video", mimeType: "video/mp4", size: 100 }];
    row.state.media.feed = { videoId: "500", uploadSessionId: "600", startOffset: 0, endOffset: 10 };
    mocks.request.mockRejectedValueOnce(
      new MetaLaunchError("Wrong offset", false, {
        error_subcode: 1363037,
        error_data: { start_offset: "10", end_offset: "20" }
      })
    );
    await processBatchLaunch("client", "job");
    expect(row.state.media.feed).toMatchObject({ startOffset: 10, endOffset: 20 });
    expect(row.status).toBe("running");
    expect(mocks.download).toHaveBeenCalledWith(row.payload.files[0], 0, 10, "client");
  });
  it("preserves video IDs and offsets after a Drive failure and resumes without recreating the adset", async () => {
    row.state.adsetId = "100";
    row.payload.files = [{ ...feed, kind: "video", mimeType: "video/mp4", size: 131615479 }];
    row.state.media.feed = { videoId: "500", uploadSessionId: "600", startOffset: 105906176, endOffset: 111149056 };
    const progress = structuredClone(row.state.media);
    mocks.download.mockRejectedValueOnce(new Error("Drive-Download fehlgeschlagen (HTTP 403, rateLimitExceeded)."));
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.state.media).toEqual(progress);
    expect(row.state.adsetId).toBe("100");
    expect(row.state.ads).toEqual({});
    expect(mocks.request).not.toHaveBeenCalled();
    row.status = "pending"; // Explicit user resume after Drive recovers.
    mocks.request.mockResolvedValueOnce({ start_offset: "111149056", end_offset: "116391936" });
    await processBatchLaunch("client", "job");
    expect(mocks.download).toHaveBeenLastCalledWith(row.payload.files[0], 105906176, 111149056, "client");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][0]).toBe("act_111/advideos");
    expect(mocks.request.mock.calls[0][1].get("upload_phase")).toBe("transfer");
    expect(mocks.request.mock.calls[0][1].get("upload_session_id")).toBe("600");
    expect(row.state.media.feed).toMatchObject({ videoId: "500", uploadSessionId: "600", startOffset: 111149056 });
    expect(row.status).toBe("running");
  });
  it("waits for video processing before creating any ad", async () => {
    row.state.adsetId = "100";
    row.payload.files = [{ ...feed, kind: "video", mimeType: "video/mp4" }];
    row.state.media.feed = {
      videoId: "500",
      startOffset: 4,
      endOffset: 4,
      finished: true,
      finishedAt: new Date().toISOString()
    };
    mocks.request.mockResolvedValueOnce({ status: { video_status: "processing" } }).mockResolvedValueOnce({
      status: { video_status: "ready" },
      thumbnails: { data: [{ uri: "https://example.com/thumb.jpg" }] }
    });
    await processBatchLaunch("client", "job");
    expect(row.state.step).toBe("processing");
    expect(row.state.media.feed.ready).toBeUndefined();
    await processBatchLaunch("client", "job");
    expect(row.state.media.feed.ready).toBe(true);
    expect(row.state.ads).toEqual({});
  });
});
