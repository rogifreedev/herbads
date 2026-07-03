import "server-only";

import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  clients: "clients",
  metrics: "metrics",
  creatives: "creatives",
  creativeAngles: "creative-angles",
  adIdeas: "ad-ideas",
  iterations: "iterations",
  competitorIterations: "competitor-iterations",
  competitors: "competitors",
  batches: "batches",
  landingpages: "landingpages",
  knowledge: "knowledge",
  creativeAnalysis: "creative-analysis",
  videoTranscripts: "video-transcripts"
} as const;

export const META_DATA_CACHE_TAGS = [
  CACHE_TAGS.metrics,
  CACHE_TAGS.creatives,
  CACHE_TAGS.creativeAngles,
  CACHE_TAGS.adIdeas,
  CACHE_TAGS.iterations,
  CACHE_TAGS.competitors,
  CACHE_TAGS.landingpages
] as const;

export const CREATIVE_ANALYSIS_CACHE_TAGS = [
  CACHE_TAGS.creativeAnalysis,
  CACHE_TAGS.creatives,
  CACHE_TAGS.creativeAngles,
  CACHE_TAGS.adIdeas,
  CACHE_TAGS.landingpages
] as const;

export const VIDEO_TRANSCRIPT_CACHE_TAGS = [CACHE_TAGS.videoTranscripts, CACHE_TAGS.creatives] as const;
export const COMPETITOR_CACHE_TAGS = [CACHE_TAGS.competitors, CACHE_TAGS.competitorIterations, CACHE_TAGS.adIdeas] as const;
export const BATCH_CACHE_TAGS = [CACHE_TAGS.batches, CACHE_TAGS.metrics, CACHE_TAGS.creatives] as const;
export const KNOWLEDGE_CACHE_TAGS = [CACHE_TAGS.knowledge, CACHE_TAGS.competitors] as const;

export function revalidateCacheTags(...tags: string[]) {
  for (const tag of tags) revalidateTag(tag);
}
