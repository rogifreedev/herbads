import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KnowledgeUploadForm } from "@/components/knowledge-upload-form";
import { listClients } from "@/lib/clients";
import { listKnowledgeDocuments } from "@/lib/knowledge";

export default async function ClientKnowledgePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { clients } = await listClients();
  const activeClient = clients.find((client) => client.id === clientId);

  if (!activeClient && clients[0]?.id) {
    redirect(`/clients/${clients[0].id}/knowledge`);
  }

  const { documents, error } = await listKnowledgeDocuments(clientId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-heading text-4xl">Wissensdatenbank</h2>
          <p className="mt-2 text-sm text-white/60">Zielgruppen, Branding, Angebote und Claims fuer RAG-basierte Creative Analysen.</p>
        </div>
      </div>

      {error ? (
        <Alert variant="warning"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      <KnowledgeUploadForm clientId={clientId} />

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <CardTitle>Dokumente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length === 0 ? (
            <EmptyState title="Noch keine Dokumente" description="Lade TXT, Markdown, JSON, PDF oder DOCX hoch. Die Dateien werden gespeichert, in Wissens-Chunks zerlegt und optional mit Embeddings indexiert." />
          ) : null}
          {documents.map((document) => (
            <div key={document.id} className="flex flex-col justify-between gap-3 rounded-xl border border-herb-border bg-black/20 p-4 md:flex-row md:items-center">
              <div>
                <p className="font-medium text-white">{document.title}</p>
                <p className="mt-1 text-xs text-white/45">
                  {document.documentType} · {document.sourceType} · {document.chunkCount} Chunks
                  {document.fileSize ? ` · ${formatFileSize(document.fileSize)}` : ""}
                  {document.embeddingStatus ? ` · Embeddings: ${document.embeddingProvider ? `${document.embeddingProvider}/` : ""}${document.embeddingStatus}` : ""}
                </p>
                {document.errorMessage ? <p className="mt-2 max-w-2xl text-xs text-red-200">{document.errorMessage}</p> : null}
              </div>
              <Badge variant={document.status === "ready" ? "success" : document.status === "error" ? "destructive" : "warning"}>{document.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
