import "server-only";

import type { CreativePredictionResult } from "@/lib/creative-predictions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

export type PredictionFrame = {
  label: string;
  dataUrl: string;
  timeSeconds: number | null;
};

export type CreativePredictionAnalysis = {
  id: string;
  clientId: string;
  format: "static" | "video";
  fileName: string;
  fileType: string | null;
  fileSize: number;
  primaryText: string | null;
  headline: string | null;
  landingUrl: string | null;
  qualityScore: number;
  confidence: number;
  band: "high" | "medium" | "low";
  angle: string | null;
  hook: string | null;
  script: string | null;
  transcript: string | null;
  transcriptMeta: JsonRecord;
  ai: CreativePredictionResult["ai"];
  components: CreativePredictionResult["components"];
  benchmarks: CreativePredictionResult["benchmarks"];
  rationale: string[];
  frames: PredictionFrame[];
  rawResult: CreativePredictionResult;
  createdAt: string;
  updatedAt: string;
  detailHref: string;
  previewFrame: PredictionFrame | null;
};

type PredictionAnalysisRow = {
  id: string;
  client_id: string;
  format: string;
  file_name: string;
  file_type: string | null;
  file_size: number | string | null;
  primary_text: string | null;
  headline: string | null;
  landing_url: string | null;
  quality_score: number | string | null;
  confidence: number | string | null;
  band: string | null;
  angle: string | null;
  hook: string | null;
  script: string | null;
  transcript: string | null;
  transcript_meta: unknown;
  ai_result: unknown;
  components: unknown;
  benchmarks: unknown;
  rationale: unknown;
  frames: unknown;
  raw_result: unknown;
  created_at: string;
  updated_at: string;
};

export type CreateCreativePredictionAnalysisInput = {
  clientId: string;
  result: CreativePredictionResult;
  fileType: string | null;
  primaryText: string | null;
  headline: string | null;
  landingUrl: string | null;
  frames: PredictionFrame[];
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asPredictionFormat(value: string): CreativePredictionAnalysis["format"] {
  return value === "video" ? "video" : "static";
}

function asPredictionBand(value: string | null): CreativePredictionAnalysis["band"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function normalizeFrames(value: unknown): PredictionFrame[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";
      if (!dataUrl.startsWith("data:image/")) return null;
      return {
        label: typeof record.label === "string" ? record.label : "Frame",
        dataUrl,
        timeSeconds: typeof record.timeSeconds === "number" ? record.timeSeconds : null
      };
    })
    .filter((item): item is PredictionFrame => Boolean(item));
}

function mapPredictionAnalysis(row: PredictionAnalysisRow): CreativePredictionAnalysis {
  const frames = normalizeFrames(row.frames);
  const rawResult = asRecord(row.raw_result) as CreativePredictionResult;

  return {
    id: row.id,
    clientId: row.client_id,
    format: asPredictionFormat(row.format),
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: toNumber(row.file_size),
    primaryText: row.primary_text,
    headline: row.headline,
    landingUrl: row.landing_url,
    qualityScore: toNumber(row.quality_score),
    confidence: toNumber(row.confidence),
    band: asPredictionBand(row.band),
    angle: row.angle,
    hook: row.hook,
    script: row.script,
    transcript: row.transcript,
    transcriptMeta: asRecord(row.transcript_meta),
    ai: asRecord(row.ai_result) as CreativePredictionResult["ai"],
    components: asRecord(row.components) as CreativePredictionResult["components"],
    benchmarks: asRecord(row.benchmarks) as CreativePredictionResult["benchmarks"],
    rationale: asStringArray(row.rationale),
    frames,
    rawResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    detailHref: `/clients/${row.client_id}/prediction-tool/history/${row.id}`,
    previewFrame: frames[0] ?? null
  };
}

export async function saveCreativePredictionAnalysis(input: CreateCreativePredictionAnalysisInput) {
  const supabase = createSupabaseServiceRoleClient();
  const { result } = input;
  const { data, error } = await supabase
    .from("creative_prediction_analyses")
    .insert({
      client_id: input.clientId,
      format: result.format,
      file_name: result.fileName,
      file_type: input.fileType,
      file_size: result.fileSize,
      primary_text: input.primaryText,
      headline: input.headline,
      landing_url: input.landingUrl,
      quality_score: result.qualityScore,
      confidence: result.confidence,
      band: result.band,
      angle: result.angle,
      hook: result.hook,
      script: result.script,
      transcript: result.transcript,
      transcript_meta: result.transcriptMeta ?? {},
      ai_result: result.ai,
      components: result.components,
      benchmarks: result.benchmarks,
      rationale: result.rationale,
      frames: input.frames,
      raw_result: result
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapPredictionAnalysis(data as PredictionAnalysisRow);
}

export async function listCreativePredictionAnalyses(clientId: string, format?: "static" | "video" | "all") {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase
    .from("creative_prediction_analyses")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(150);

  if (format && format !== "all") query = query.eq("format", format);

  const { data, error } = await query;
  if (error) return { analyses: [], error: error.message };

  return {
    analyses: ((data ?? []) as PredictionAnalysisRow[]).map(mapPredictionAnalysis),
    error: null
  };
}

export async function getCreativePredictionAnalysis(clientId: string, analysisId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("creative_prediction_analyses")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", analysisId)
    .maybeSingle();

  if (error) return { analysis: null, error: error.message };
  if (!data) return { analysis: null, error: "Prediction Analyse wurde nicht gefunden." };

  return { analysis: mapPredictionAnalysis(data as PredictionAnalysisRow), error: null };
}
