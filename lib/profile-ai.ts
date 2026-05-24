import "server-only";

import { getOptionalEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { upsertClientProfile, type ClientProfileInput } from "@/lib/clients";

type KnowledgeChunkRow = {
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
};

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: OpenRouterMessageContent;
    };
  }>;
  error?: { message?: string };
};

type OpenRouterMessageContent = string | Array<{ type?: string; text?: string }> | undefined;

const emptyProfileInput: ClientProfileInput = {
  brandName: "",
  positioning: "",
  toneOfVoice: "",
  targetAudience: "",
  painPoints: "",
  buyingTriggers: "",
  usps: "",
  offers: "",
  forbiddenClaims: "",
  brandNoGos: "",
  competitors: "",
  ctaPreferences: ""
};

const profileKeys = Object.keys(emptyProfileInput) as Array<keyof ClientProfileInput>;

function textFromContent(content: OpenRouterMessageContent) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item.text ?? "").join("\n");
  return "";
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("OpenRouter Antwort enthielt kein JSON Objekt.");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeProfilePayload(payload: Record<string, unknown>): ClientProfileInput {
  return profileKeys.reduce<ClientProfileInput>((profile, key) => {
    const value = payload[key];
    profile[key] = typeof value === "string" ? value.trim() : "";
    return profile;
  }, { ...emptyProfileInput });
}

function knowledgeContext(chunks: KnowledgeChunkRow[]) {
  const maxCharacters = 42000;
  let usedCharacters = 0;
  const parts: string[] = [];

  for (const chunk of chunks) {
    const title = typeof chunk.metadata?.document_title === "string" ? chunk.metadata.document_title : "Wissensdokument";
    const type = typeof chunk.metadata?.document_type === "string" ? chunk.metadata.document_type : "general";
    const prefix = `Quelle: ${title} (${type}), Chunk ${chunk.chunk_index + 1}`;
    const next = `${prefix}\n${chunk.content.trim()}`;

    if (usedCharacters + next.length > maxCharacters) break;
    parts.push(next);
    usedCharacters += next.length;
  }

  return parts.join("\n\n---\n\n");
}

async function loadKnowledgeContext(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("client_knowledge_chunks")
    .select("content,chunk_index,metadata")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("chunk_index", { ascending: true })
    .limit(120);

  if (error) throw new Error(error.message);
  const chunks = (data ?? []) as KnowledgeChunkRow[];

  if (chunks.length === 0) {
    throw new Error("Keine Wissensdatenbank-Inhalte gefunden. Bitte lade zuerst ein Strategie-, Brand- oder Angebotsdokument hoch.");
  }

  return knowledgeContext(chunks);
}

async function callOpenRouterForProfile(clientName: string, context: string) {
  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY fehlt. Bitte in .env.local setzen.");
  }

  const model = getOptionalEnv("OPENROUTER_TEXT_MODEL", "openai/gpt-5.2");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": getOptionalEnv("OPENROUTER_HTTP_REFERER", getOptionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3001")),
      "X-OpenRouter-Title": getOptionalEnv("OPENROUTER_APP_TITLE", "Herb Ads"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Du bist ein Senior Performance-Marketing-Stratege. Extrahiere aus Kundenwissen ein sauberes Kundenprofil fuer Creative-Analyse und Ad-Konzeption. Antworte ausschliesslich mit einem validen JSON Objekt. Keine Markdown-Fences, keine Erklaerung. Wenn Informationen nicht sicher im Material stehen, verwende einen leeren String."
        },
        {
          role: "user",
          content: `Kunde: ${clientName}\n\nErzeuge exakt diese JSON Keys als Strings:\nbrandName, positioning, toneOfVoice, targetAudience, painPoints, buyingTriggers, usps, offers, forbiddenClaims, brandNoGos, competitors, ctaPreferences.\n\nHinweise:\n- Sprache: Deutsch.\n- Kompakt, aber konkret.\n- Mehrere Punkte innerhalb eines Feldes als kurze Bullet-Zeilen mit "- ".\n- Keine erfundenen Aussagen.\n\nWissensdatenbank:\n${context}`
        }
      ]
    })
  });
  const payload = (await response.json()) as OpenRouterChatResponse;

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "OpenRouter konnte das Kundenprofil nicht erzeugen.");
  }

  const content = textFromContent(payload.choices?.[0]?.message?.content);
  if (!content.trim()) throw new Error("OpenRouter Antwort war leer.");

  return normalizeProfilePayload(extractJsonObject(content));
}

export async function generateClientProfileFromKnowledge(clientId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: client, error: clientError } = await supabase.from("clients").select("id,name").eq("id", clientId).maybeSingle();

  if (clientError) throw new Error(clientError.message);
  if (!client) throw new Error("Kunde wurde nicht gefunden.");

  const context = await loadKnowledgeContext(clientId);
  const generatedProfile = await callOpenRouterForProfile(client.name, context);
  const profile = await upsertClientProfile(clientId, generatedProfile);

  return { profile };
}
