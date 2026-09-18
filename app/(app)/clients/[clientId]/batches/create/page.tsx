import { BatchLaunchForm } from "@/components/batch-launch-form";
import { getBatchLaunchJob, mapLaunchJob } from "@/lib/batch-launch";
import { notFound } from "next/navigation";

export default async function CreateBatchPage({
  params,
  searchParams
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ folderId?: string; jobId?: string }>;
}) {
  const [{ clientId }, { folderId, jobId }] = await Promise.all([params, searchParams]);
  const row = jobId ? await getBatchLaunchJob(clientId, jobId) : null;
  if (row && row.drive_folder_id !== folderId) notFound();
  return (
    <BatchLaunchForm
      key={`${clientId}:${folderId}:${jobId ?? ""}`}
      clientId={clientId}
      folderId={folderId ?? ""}
      initialJob={row ? mapLaunchJob(row) : undefined}
    />
  );
}
