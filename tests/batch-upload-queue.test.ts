import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), database: vi.fn(), process: vi.fn(), heads: [] as unknown[] }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.database }));
vi.mock("@/lib/batch-launch-worker", () => ({ processBatchLaunch: mocks.process }));
import { authorizeBatchUploadWorker, processBatchUploadQueue } from "@/lib/batch-upload-queue";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.heads = [];
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.process.mockResolvedValue({ status: "completed", state: { step: "done" } });
  mocks.database.mockReturnValue({
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: mocks.heads.shift() ?? null, error: null })
      };
      return query;
    }
  });
});

describe("server-side FIFO dispatcher", () => {
  it("drains successive jobs without browser requests and releases the global lease", async () => {
    mocks.heads = [
      { id: "a", client_id: "client-a" },
      { id: "b", client_id: "client-b" }
    ];
    expect(await processBatchUploadQueue()).toEqual({ busy: false, steps: 2 });
    expect(mocks.process.mock.calls.map(([client, job]) => [client, job])).toEqual([
      ["client-a", "a"],
      ["client-b", "b"]
    ]);
    const token = mocks.rpc.mock.calls[0][1].p_token;
    expect(mocks.process.mock.calls.every(([, , lease]) => lease === token)).toBe(true);
    expect(mocks.rpc).toHaveBeenLastCalledWith("release_batch_upload_queue", { p_token: token, p_error: null });
  });
  it("does nothing when another dispatcher holds the lease", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await processBatchUploadQueue()).toEqual({ busy: true, steps: 0 });
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not skip a busy head job to run the next batch", async () => {
    mocks.heads = [
      { id: "a", client_id: "client", lease_until: new Date(Date.now() + 60000).toISOString() },
      { id: "b", client_id: "client" }
    ];
    expect((await processBatchUploadQueue()).steps).toBe(0);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("yields during Meta video processing, preserving FIFO for the next scheduled invocation", async () => {
    mocks.heads = [
      { id: "a", client_id: "client" },
      { id: "b", client_id: "client" }
    ];
    mocks.process.mockResolvedValue({ status: "running", state: { step: "processing" } });
    expect((await processBatchUploadQueue()).steps).toBe(1);
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });
  it("moves on after a job fails or requires review", async () => {
    mocks.heads = [
      { id: "a", client_id: "client" },
      { id: "b", client_id: "client" },
      { id: "c", client_id: "client" }
    ];
    mocks.process
      .mockResolvedValueOnce({ status: "review", state: {} })
      .mockResolvedValueOnce({ status: "failed", state: {} });
    expect((await processBatchUploadQueue()).steps).toBe(3);
  });
  it("bounds even fast work and leaves long-step time before serverless termination", async () => {
    mocks.heads = Array.from({ length: 50 }, () => ({ id: "a", client_id: "client" }));
    expect((await processBatchUploadQueue()).steps).toBe(40);
  });
  it("records dispatcher failure and releases the lease", async () => {
    mocks.heads = [{ id: "a", client_id: "client" }];
    mocks.process.mockRejectedValue(new Error("Database unavailable"));
    await expect(processBatchUploadQueue()).rejects.toThrow("Database unavailable");
    expect(mocks.rpc).toHaveBeenLastCalledWith("release_batch_upload_queue", {
      p_token: expect.any(String),
      p_error: "Database unavailable"
    });
  });
  it("rejects missing or invalid credentials before the database and fails closed", async () => {
    expect(await authorizeBatchUploadWorker("")).toBe(false);
    expect(await authorizeBatchUploadWorker("bad")).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await authorizeBatchUploadWorker("a".repeat(64))).toBe(false);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Unavailable" } });
    expect(await authorizeBatchUploadWorker("a".repeat(64))).toBe(false);
  });
});
