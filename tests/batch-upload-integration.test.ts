import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchLaunchJobRow } from "@/lib/batch-launch";
import { campaign, feed, launchInput, template } from "./batch-launch-fixtures";
import { buildAdSetPayload } from "@/lib/batch-launch-plan";
const mocks = vi.hoisted(() => ({ db: vi.fn(), getJob: vi.fn(), meta: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.db }));
vi.mock("@/lib/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/batch-launch")>()),
  getBatchLaunchJob: mocks.getJob
}));
vi.mock("@/lib/batch-launch-drive", () => ({ downloadBatchMedia: mocks.download }));
vi.mock("@/lib/meta/batch-launch", async (original) => ({
  ...(await original<typeof import("@/lib/meta/batch-launch")>()),
  metaLaunchRequest: mocks.meta
}));
vi.mock("@/lib/cache-tags", () => ({ BATCH_CACHE_TAGS: [], revalidateCacheTags: vi.fn() }));
import { processBatchUploadQueue } from "@/lib/batch-upload-queue";
import { MetaLaunchError } from "@/lib/meta/batch-launch";
let jobs: BatchLaunchJobRow[];
let queueToken: string | null;
let activeWrites: number;
let maxWrites: number;
let sequence: string[];

beforeEach(() => {
  vi.clearAllMocks();
  queueToken = null;
  activeWrites = 0;
  maxWrites = 0;
  sequence = [];
  jobs = ["a", "b", "c"].map((id) => ({
    id,
    client_id: "client",
    ad_account_id: "account",
    drive_folder_id: `folder-${id}`,
    meta_campaign_id: campaign.id,
    name: id,
    status: "pending",
    queue_enabled: true,
    control_status: "run",
    lease_token: null,
    lease_until: null,
    payload: {
      input: { ...structuredClone(launchInput), name: id },
      files: [feed],
      metaAccountId: "act_111",
      campaign,
      adsetPayload: { ...buildAdSetPayload(id, campaign, template, launchInput.settings, "EUR"), name: id }
    },
    state: { media: {}, ads: {}, step: "adset" },
    error: null,
    updated_at: new Date().toISOString()
  }));
  mocks.getJob.mockImplementation(async (_client, id) => structuredClone(jobs.find((job) => job.id === id)));
  mocks.download.mockResolvedValue(Buffer.from("file"));
  let counter = 100;
  mocks.meta.mockImplementation(async (path: string, body?: Record<string, unknown>) => {
    activeWrites++;
    maxWrites = Math.max(maxWrites, activeWrites);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (path.endsWith("/adsets")) sequence.push(String(body?.name));
      if (path.endsWith("/adimages")) return { images: { a: { hash: "hash" } } };
      return { id: String(++counter) };
    } finally {
      activeWrites--;
    }
  });
  mocks.db.mockReturnValue({
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "claim_batch_upload_queue") {
        const granted = !queueToken;
        if (granted) queueToken = String(args.p_token);
        return Promise.resolve({ data: granted });
      }
      if (name === "release_batch_upload_queue") {
        if (queueToken === args.p_token) queueToken = null;
        return Promise.resolve({ data: true });
      }
      const row = jobs.find((job) => job.id === args.p_job_id)!;
      if (name === "claim_batch_upload_step")
        return {
          maybeSingle: async () => {
            if (queueToken !== args.p_queue_token || row.lease_token) return { data: null };
            row.lease_token = String(args.p_token);
            row.status = "running";
            return { data: structuredClone(row) };
          }
        };
      if (name === "persist_batch_upload_step") {
        if (row.lease_token !== args.p_token) return Promise.resolve({ data: false });
        row.state = structuredClone(args.p_state) as BatchLaunchJobRow["state"];
        row.status = args.p_status as BatchLaunchJobRow["status"];
        row.error = args.p_error as string | null;
        if (args.p_release) row.lease_token = null;
        return Promise.resolve({ data: true });
      }
      throw new Error(name);
    },
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        update: () => query,
        upsert: () => query,
        maybeSingle: async () => ({ data: jobs.find((job) => ["pending", "running"].includes(job.status)) ?? null }),
        single: async () => ({ data: { id: table } }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: true }).then(resolve)
      };
      return query;
    }
  });
});

describe("complete browser-independent upload queue", () => {
  it("executes three complete batches in order with one dispatcher and one Meta write at a time", async () => {
    const first = processBatchUploadQueue();
    await vi.waitFor(() => expect(mocks.meta).toHaveBeenCalled());
    expect((await processBatchUploadQueue()).busy).toBe(true);
    await first;
    expect(jobs.map((job) => job.status)).toEqual(["completed", "completed", "completed"]);
    expect(sequence).toEqual(["a", "b", "c"]);
    expect(maxWrites).toBe(1);
    expect(mocks.meta.mock.calls.filter(([path]) => path.endsWith("/ads"))).toHaveLength(3);
    expect(
      mocks.meta.mock.calls.filter(([path]) => path.endsWith("/adsets")).every(([, body]) => body.status === "PAUSED")
    ).toBe(true);
    expect(queueToken).toBeNull();
  });
  it("quarantines an ambiguous Meta write and continues the other batches without retrying it", async () => {
    mocks.meta.mockRejectedValueOnce(new MetaLaunchError("Uncertain write", true));
    await processBatchUploadQueue();
    expect(jobs.map((job) => job.status)).toEqual(["review", "completed", "completed"]);
    expect(jobs[0].state.inFlight).toBe("adset");
    expect(mocks.meta.mock.calls.filter(([path, body]) => path.endsWith("/adsets") && body.name === "a")).toHaveLength(
      1
    );
    await processBatchUploadQueue();
    expect(jobs[0].status).toBe("review");
  });
});
