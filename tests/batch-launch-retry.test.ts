import { describe, expect, it } from "vitest";
import { canRestartBatch } from "@/lib/batch-launch-retry";
import type { BatchLaunchJob } from "@/lib/batch-launch-types";

const cancelled: Pick<BatchLaunchJob, "status" | "state"> = {
  status: "cancelled",
  state: {
    step: "ad",
    adsetId: "100",
    media: { image: { imageHash: "uploaded" } },
    ads: { first: { creativeId: "200" } }
  }
};

describe("cancelled batch restart", () => {
  it("allows a fresh attempt after a confirmed rejection before the first ad", () => {
    expect(canRestartBatch(cancelled)).toBe(true);
  });
  it.each(["pending", "running", "paused", "failed", "review", "completed"] as const)(
    "never releases a %s attempt",
    (status) => expect(canRestartBatch({ ...cancelled, status })).toBe(false)
  );
  it("keeps leased jobs protected", () => expect(canRestartBatch(cancelled, true)).toBe(false));
  it.each([
    { inFlight: "ad:first" },
    { activationStarted: true },
    { activated: true },
    { ads: { first: { creativeId: "200", adId: "300" } } }
  ])("keeps uncertain or partially created jobs protected: %j", (state) => {
    expect(canRestartBatch({ ...cancelled, state: { ...cancelled.state, ...state } })).toBe(false);
  });
});
