import { BatchLaunchForm } from "@/components/batch-launch-form";

export default async function CreateBatchPage({
  params,
  searchParams
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ folderId?: string }>;
}) {
  const [{ clientId }, { folderId }] = await Promise.all([params, searchParams]);
  return <BatchLaunchForm key={`${clientId}:${folderId}`} clientId={clientId} folderId={folderId ?? ""} />;
}
