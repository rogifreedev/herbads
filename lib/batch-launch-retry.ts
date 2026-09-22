import type { BatchLaunchJob } from "@/lib/batch-launch-types";

// Keep this aligned with the batch_launch_jobs_current_attempt_idx predicate.
export function canRestartBatch(job: Pick<BatchLaunchJob, "status" | "state">, leased = false) {
  return (
    job.status === "cancelled" &&
    !leased &&
    job.state.inFlight == null &&
    !job.state.activationStarted &&
    !job.state.activated &&
    !Object.values(job.state.ads).some((ad) => Object.hasOwn(ad, "adId"))
  );
}
