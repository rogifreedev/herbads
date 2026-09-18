import { BatchUploadDashboard } from "@/components/batch-upload-dashboard";

export default async function UploadsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  return <BatchUploadDashboard initialClientId={clientId ?? ""} />;
}
