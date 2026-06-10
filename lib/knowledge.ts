import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS, KNOWLEDGE_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";
import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "pdf", "docx"]);
const DOCUMENT_TYPES = new Set(["general", "brand", "audience", "offer", "claims", "competitors"]);

export type KnowledgeDocument = {
  id: string;
  clientId: string;
  title: string;
  documentType: string;
  sourceType: string;
  status: string;
  storagePath: string | null;
  errorMessage: string | null;
  chunkCount: number;
  embeddingProvider: string | null;
  embeddingStatus: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
};

type UploadKnowledgeDocumentInput = {
  clientId: string;
  title?: string;
  documentType?: string;
  file: File;
};

type EmbeddingResult = {
  embeddings: Array<number[] | null>;
  model: string | null;
  provider: "openrouter" | "openai" | null;
  status: "created" | "skipped_missing_api_key";
};

type OpenAiEmbeddingResponse = {
  data?: Array<{ index: number; embedding: number[] }>;
  error?: { message?: string };
};

const EMBEDDING_DIMENSIONS = 1536;

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as JsonRecord)[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function mapKnowledgeDocument(document: {
  id: string;
  client_id: string;
  title: string;
  document_type: string;
  source_type: string;
  status: string;
  storage_path: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
}): KnowledgeDocument {
  const chunkCount = metadataValue(document.metadata, "chunk_count");
  const fileSize = metadataValue(document.metadata, "file_size");

  return {
    id: document.id,
    clientId: document.client_id,
    title: document.title,
    documentType: document.document_type,
    sourceType: document.source_type,
    status: document.status,
    storagePath: document.storage_path,
    errorMessage: document.error_message,
    chunkCount: typeof chunkCount === "number" ? chunkCount : 0,
    embeddingProvider: typeof metadataValue(document.metadata, "embedding_provider") === "string" ? String(metadataValue(document.metadata, "embedding_provider")) : null,
    embeddingStatus: typeof metadataValue(document.metadata, "embedding_status") === "string" ? String(metadataValue(document.metadata, "embedding_status")) : null,
    fileName: typeof metadataValue(document.metadata, "file_name") === "string" ? String(metadataValue(document.metadata, "file_name")) : null,
    fileSize: typeof fileSize === "number" ? fileSize : null,
    createdAt: document.created_at
  };
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function cleanStorageName(fileName: string) {
  const extension = fileExtension(fileName);
  const baseName = fileName.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${baseName || "knowledge-document"}.${extension || "txt"}`;
}

function normalizeDocumentType(value: string | undefined) {
  const documentType = value?.trim().toLowerCase() || "general";
  if (!DOCUMENT_TYPES.has(documentType)) return "general";
  return documentType;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensureClientExists(clientId: string) {
  if (!isUuid(clientId)) {
    throw new Error("Ungueltige Kunden-ID. Bitte waehle zuerst einen echten Kunden im Dropdown aus.");
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Kunde wurde nicht gefunden. Bitte waehle einen vorhandenen Kunden aus.");
}

async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Uint8Array.from(buffer) });

  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

async function extractTextFromBuffer(buffer: Buffer, extension: string) {
  if (extension === "pdf") return extractPdfText(buffer);
  if (extension === "docx") return extractDocxText(buffer);

  const text = buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (extension !== "json") return text;

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function approximateTokenCount(text: string) {
  return Math.ceil(text.length / 4);
}

function chunkText(text: string) {
  const chunkSizeTokens = Number(getOptionalEnv("KNOWLEDGE_CHUNK_SIZE_TOKENS", "800"));
  const overlapTokens = Number(getOptionalEnv("KNOWLEDGE_CHUNK_OVERLAP_TOKENS", "120"));
  const targetLength = Math.max(800, (Number.isFinite(chunkSizeTokens) ? chunkSizeTokens : 800) * 4);
  const overlapLength = Math.max(0, Math.min(targetLength - 200, (Number.isFinite(overlapTokens) ? overlapTokens : 120) * 4));
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + targetLength, normalized.length);

    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", end);
      const sentenceBreak = normalized.lastIndexOf(". ", end);
      const preferredBreak = Math.max(paragraphBreak, sentenceBreak);
      if (preferredBreak > start + targetLength * 0.55) end = preferredBreak + 1;
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;

    start = Math.max(end - overlapLength, start + 1);
  }

  return chunks;
}

async function ensureKnowledgeBucket() {
  const supabase = createSupabaseServiceRoleClient();
  const bucket = getOptionalEnv("SUPABASE_KNOWLEDGE_BUCKET", "knowledge-documents");
  const { error: getError } = await supabase.storage.getBucket(bucket);

  if (!getError) return bucket;

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: [
      "text/plain",
      "text/markdown",
      "application/json",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream"
    ]
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw createError;
  }

  return bucket;
}

function validateEmbeddingDimensions(embedding: number[], model: string) {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding Modell ${model} liefert ${embedding.length} Dimensionen, erwartet sind ${EMBEDDING_DIMENSIONS} fuer pgvector.`);
  }
}

async function createOpenRouterEmbeddings(texts: string[], apiKey: string): Promise<EmbeddingResult> {
  const model = getOptionalEnv("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small");
  const embeddings: Array<number[] | null> = texts.map(() => null);

  for (let index = 0; index < texts.length; index += 32) {
    const batch = texts.slice(index, index + 32);
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": getOptionalEnv("OPENROUTER_HTTP_REFERER", getOptionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3001")),
        "X-OpenRouter-Title": getOptionalEnv("OPENROUTER_APP_TITLE", "Herb Ads"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, input: batch })
    });
    const payload = (await response.json()) as OpenAiEmbeddingResponse;

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? "OpenRouter Embeddings konnten nicht erstellt werden.");
    }

    for (const [batchIndex, item] of (payload.data ?? []).entries()) {
      validateEmbeddingDimensions(item.embedding, model);
      embeddings[index + (item.index ?? batchIndex)] = item.embedding;
    }
  }

  return { embeddings, model, provider: "openrouter", status: "created" };
}

async function createOpenAiEmbeddings(texts: string[], apiKey: string): Promise<EmbeddingResult> {
  const model = getOptionalEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small");
  const embeddings: Array<number[] | null> = texts.map(() => null);

  for (let index = 0; index < texts.length; index += 32) {
    const batch = texts.slice(index, index + 32);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, input: batch })
    });
    const payload = (await response.json()) as OpenAiEmbeddingResponse;

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? "OpenAI Embeddings konnten nicht erstellt werden.");
    }

    for (const [batchIndex, item] of (payload.data ?? []).entries()) {
      validateEmbeddingDimensions(item.embedding, model);
      embeddings[index + (item.index ?? batchIndex)] = item.embedding;
    }
  }

  return { embeddings, model, provider: "openai", status: "created" };
}

async function createEmbeddings(texts: string[]): Promise<EmbeddingResult> {
  const openRouterKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (openRouterKey) return createOpenRouterEmbeddings(texts, openRouterKey);

  const openAiKey = getOptionalEnv("OPENAI_API_KEY");
  if (openAiKey) return createOpenAiEmbeddings(texts, openAiKey);

  return { embeddings: texts.map(() => null), model: null, provider: null, status: "skipped_missing_api_key" };
}

async function listKnowledgeDocumentsUncached(clientId: string): Promise<{ documents: KnowledgeDocument[]; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("client_knowledge_documents")
      .select("id,client_id,title,document_type,source_type,status,storage_path,error_message,metadata,created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      return { documents: [], error: error.message };
    }

    return {
      documents: (data ?? []).map(mapKnowledgeDocument),
      error: null
    };
  } catch (error) {
    return {
      documents: [],
      error: error instanceof Error ? error.message : "Wissensdokumente konnten nicht geladen werden."
    };
  }
}

const listKnowledgeDocumentsCached = unstable_cache(
  listKnowledgeDocumentsUncached,
  ["knowledge-documents-v1"],
  { revalidate: 120, tags: [CACHE_TAGS.knowledge] }
);

export async function listKnowledgeDocuments(clientId: string): Promise<{ documents: KnowledgeDocument[]; error: string | null }> {
  return listKnowledgeDocumentsCached(clientId);
}

export async function uploadKnowledgeDocument(input: UploadKnowledgeDocumentInput) {
  const supabase = createSupabaseServiceRoleClient();
  const originalFileName = input.file.name || "knowledge-document.txt";
  const extension = fileExtension(originalFileName);
  const title = input.title?.trim() || originalFileName.replace(/\.[^.]+$/, "") || "Wissensdokument";
  const documentType = normalizeDocumentType(input.documentType);
  let documentId: string | null = null;

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("Aktuell werden TXT, Markdown, JSON, PDF und DOCX unterstuetzt.");
  }

  if (input.file.size <= 0) {
    throw new Error("Die Datei ist leer.");
  }

  if (input.file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Die Datei ist zu gross. Maximal erlaubt sind 10 MB.");
  }

  await ensureClientExists(input.clientId);

  try {
    const bucket = await ensureKnowledgeBucket();
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const content = await extractTextFromBuffer(buffer, extension);

    if (content.length < 20) {
      throw new Error("Aus der Datei konnte nicht genug Text extrahiert werden.");
    }

    const { data: document, error: insertError } = await supabase
      .from("client_knowledge_documents")
      .insert({
        client_id: input.clientId,
        title,
        document_type: documentType,
        source_type: "upload",
        status: "processing",
        metadata: {
          file_name: originalFileName,
          file_size: input.file.size,
          mime_type: input.file.type || null
        }
      })
      .select("id")
      .single();

    if (insertError || !document) throw insertError ?? new Error("Wissensdokument konnte nicht angelegt werden.");
    documentId = document.id;

    const storagePath = `${input.clientId}/${document.id}/${cleanStorageName(originalFileName)}`;
    const { error: storageError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      contentType: input.file.type || "text/plain",
      upsert: true
    });

    if (storageError) throw storageError;

    const chunks = chunkText(content);
    const embeddingResult = await createEmbeddings(chunks);

    if (chunks.length === 0) {
      throw new Error("Es konnten keine Wissens-Chunks erzeugt werden.");
    }

    await supabase.from("client_knowledge_chunks").delete().eq("document_id", document.id);
    const { error: chunksError } = await supabase.from("client_knowledge_chunks").insert(
      chunks.map((chunk, index) => ({
        client_id: input.clientId,
        document_id: document.id,
        content: chunk,
        embedding: embeddingResult.embeddings[index],
        chunk_index: index,
        token_count: approximateTokenCount(chunk),
        metadata: {
          document_title: title,
          document_type: documentType,
          file_name: originalFileName
        }
      }))
    );

    if (chunksError) throw chunksError;

    const metadata = {
      file_name: originalFileName,
      file_size: input.file.size,
      mime_type: input.file.type || null,
      chunk_count: chunks.length,
      embedding_provider: embeddingResult.provider,
      embedding_model: embeddingResult.model,
      embedding_status: embeddingResult.status
    };
    const { data: readyDocument, error: updateError } = await supabase
      .from("client_knowledge_documents")
      .update({ storage_path: storagePath, status: "ready", metadata })
      .eq("id", document.id)
      .select("id,client_id,title,document_type,source_type,status,storage_path,error_message,metadata,created_at")
      .single();

    if (updateError || !readyDocument) throw updateError ?? new Error("Wissensdokument konnte nicht finalisiert werden.");

    revalidateCacheTags(...KNOWLEDGE_CACHE_TAGS);
    return mapKnowledgeDocument(readyDocument);
  } catch (error) {
    if (documentId) {
      await supabase
        .from("client_knowledge_documents")
        .update({ status: "error", error_message: error instanceof Error ? error.message : "Upload fehlgeschlagen." })
        .eq("id", documentId);
      revalidateCacheTags(...KNOWLEDGE_CACHE_TAGS);
    }

    throw error;
  }
}
