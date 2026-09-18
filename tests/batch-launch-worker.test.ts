import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchLaunchJobRow } from "@/lib/batch-launch";
import { campaign, feed, launchInput, template } from "./batch-launch-fixtures";
import { buildAdSetPayload } from "@/lib/batch-launch-plan";
import { normalizeBatchCopy } from "@/lib/batch-launch-copy";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  request: vi.fn(),
  download: vi.fn(),
  database: vi.fn(),
  revalidate: vi.fn()
}));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-drive", () => ({ downloadBatchMedia: mocks.download }));
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
    state: { media: {}, ads: {}, step: "adset" },
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
  mocks.request.mockImplementation(async (path: string, values?: Record<string, unknown>) =>
    path.includes("?fields=status,daily_budget")
      ? { status: "ACTIVE" }
      : values?.status === "ACTIVE"
        ? { success: true }
        : path.endsWith("/adimages")
          ? { images: { image: { hash: "hash" } } }
          : { id: path.endsWith("/adsets") ? "100" : path.endsWith("/adcreatives") ? "200" : "300" }
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
  it("creates one paused ad with all 15 text variants and retains them in the stored creative", async () => {
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
    expect(adCalls[0][1].status).toBe("PAUSED");
    for (const key of ["bodies", "titles", "descriptions"])
      expect(creativeCalls[0][1].asset_feed_spec[key]).toHaveLength(5);
    expect(writes.find((write) => write.table === "creatives")?.values).toMatchObject({
      body: "Body 0",
      title: "Title 0",
      raw: creativeCalls[0][1]
    });
  });
  it("finishes every ad before enabling any of them, with the parent always last", async () => {
    row.payload.input.activate = true;
    row.payload.files.push({ ...feed, id: "second" });
    row.payload.input.groups.push({ id: "ad-2", name: "Second", feedFileId: "second", storyFileId: null });
    let adCount = 0;
    mocks.request.mockImplementation(async (path: string, values?: Record<string, unknown>) => {
      if (values?.status === "ACTIVE") {
        expect(adCount).toBe(2);
        return { success: true };
      }
      if (path.includes("?fields=status,daily_budget")) return { status: "ACTIVE" };
      if (path.endsWith("/adimages")) return { images: { image: { hash: "hash" } } };
      if (path.endsWith("/ads")) return { id: String(300 + ++adCount) };
      return { id: path.endsWith("/adsets") ? "100" : "200" };
    });
    for (let i = 0; i < 11; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(mocks.request.mock.calls.filter(([, values]) => values?.status === "ACTIVE").map(([path]) => path)).toEqual([
      "301",
      "302",
      "100"
    ]);
  });
  it("creates everything paused and activates the new parent only after all ads", async () => {
    row.payload.input.activate = true;
    for (let i = 0; i < 7; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(row.state.activated).toBe(true);
    const calls = mocks.request.mock.calls;
    expect(calls.find(([path]) => path.endsWith("/adsets"))?.[1].status).toBe("PAUSED");
    expect(calls.find(([path]) => path.endsWith("/ads"))?.[1].status).toBe("PAUSED");
    expect(calls.filter(([, values]) => values?.status === "ACTIVE").map(([path]) => path)).toEqual(["300", "100"]);
    expect(calls.some(([path, values]) => path === campaign.id && values)).toBe(false);
    expect(writes.find((write) => write.table === "batch_folder_checks")?.values).toMatchObject({
      status: "live",
      match_status: "ACTIVE"
    });
  });
  it("does not activate any object when media upload fails", async () => {
    row.payload.input.activate = true;
    await processBatchLaunch("client", "job");
    mocks.download.mockRejectedValueOnce(new Error("Drive unavailable"));
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(mocks.request.mock.calls.some(([, values]) => values?.status === "ACTIVE")).toBe(false);
  });
  it("stops if the campaign is paused before the final activation", async () => {
    row.payload.input.activate = true;
    for (let i = 0; i < 5; i++) await processBatchLaunch("client", "job");
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
    for (let i = 0; i < 5; i++) await processBatchLaunch("client", "job");
    mocks.request.mockResolvedValueOnce({ status: "ACTIVE", daily_budget: "99999" });
    await processBatchLaunch("client", "job");
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/Budget|budget/);
    expect(row.state.activationStarted).toBeUndefined();
  });
  it("retries an uncertain activation on the same ID without creating more objects", async () => {
    row.payload.input.activate = true;
    for (let i = 0; i < 5; i++) await processBatchLaunch("client", "job");
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
  it("creates one adset and one paused ad across persistent steps", async () => {
    for (let i = 0; i < 5; i++) await processBatchLaunch("client", "job");
    expect(row.status).toBe("completed");
    expect(row.state.ads["ad-1"]).toEqual({ creativeId: "200", adId: "300" });
    expect(mocks.request.mock.calls.filter(([path]) => path.endsWith("/adsets"))).toHaveLength(1);
    expect(mocks.request.mock.calls.find(([path]) => path.endsWith("/adsets"))?.[1]).toHaveProperty("status", "PAUSED");
    expect(mocks.request.mock.calls.find(([path]) => path.endsWith("/ads"))?.[1]).toMatchObject({
      status: "PAUSED",
      adset_id: "100"
    });
    expect(writes.find((write) => write.table === "batch_folder_checks")?.values).toMatchObject({
      status: "found",
      match_status: "PAUSED"
    });
    expect(row.lease_token).toBeNull();
    await processBatchLaunch("client", "job");
    expect(mocks.request).toHaveBeenCalledTimes(4);
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
    expect(mocks.download).toHaveBeenCalledWith(row.payload.files[0], 0, 10);
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
