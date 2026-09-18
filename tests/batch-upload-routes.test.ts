import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  process: vi.fn(),
  control: vi.fn(),
  getJob: vi.fn(),
  map: vi.fn()
}));
vi.mock("@/lib/batch-upload-queue", () => ({
  authorizeBatchUploadWorker: mocks.authorize,
  processBatchUploadQueue: mocks.process,
  controlBatchUpload: mocks.control
}));
vi.mock("@/lib/batch-launch", () => ({ getBatchLaunchJob: mocks.getJob, mapLaunchJob: mocks.map }));
import { POST as worker } from "@/app/api/cron/batches/uploads/route";
import { GET, POST } from "@/app/api/clients/[clientId]/batches/launch/[jobId]/route";
const context = { params: Promise.resolve({ clientId: "client", jobId: "job" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue(false);
  mocks.process.mockResolvedValue({ steps: 2 });
  mocks.getJob.mockResolvedValue({ id: "job" });
  mocks.map.mockImplementation((value) => value);
  mocks.control.mockResolvedValue({ id: "job", status: "paused" });
});
describe("background upload routes", () => {
  it("requires a valid worker token before dispatch", async () => {
    expect((await worker(new Request("https://example.com/api/cron/batches/uploads", { method: "POST" }))).status).toBe(
      401
    );
    expect(mocks.process).not.toHaveBeenCalled();
    mocks.authorize.mockResolvedValue(true);
    expect(
      (
        await worker(
          new Request("https://example.com/api/cron/batches/uploads", {
            method: "POST",
            headers: { Authorization: "Bearer token" }
          })
        )
      ).status
    ).toBe(200);
    expect(mocks.authorize).toHaveBeenLastCalledWith("token");
  });
  it("polling and legacy empty POST requests only read state, never advance or resume jobs", async () => {
    await GET(new Request("https://example.com/job"), context);
    await POST(new Request("https://example.com/job", { method: "POST" }), context);
    expect(mocks.getJob).toHaveBeenCalledTimes(2);
    expect(mocks.control).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("scopes explicit controls to the client and job in the route", async () => {
    const response = await POST(
      new Request("https://example.com/job", {
        method: "POST",
        body: JSON.stringify({ action: "pause", clientId: "foreign" })
      }),
      context
    );
    expect(response.status).toBe(200);
    expect(mocks.control).toHaveBeenCalledWith("client", "job", "pause");
  });
});
