import type { BatchLaunchCopy, BatchTemplateCopySource } from "@/lib/batch-launch-types";

export const MAX_COPY_VARIANTS = 5;

export function copyVariants(copy: BatchLaunchCopy) {
  const clean = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return {
    primaryTexts: clean(copy.primaryTexts ?? [copy.primaryText]),
    headlines: clean(copy.headlines ?? [copy.headline]),
    descriptions: clean(copy.descriptions ?? [copy.description])
  };
}

export function normalizeBatchCopy(copy: BatchLaunchCopy): BatchLaunchCopy {
  const variants = copyVariants(copy);
  return {
    ...copy,
    ...variants,
    primaryText: variants.primaryTexts[0] ?? "",
    headline: variants.headlines[0] ?? "",
    description: variants.descriptions[0] ?? ""
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
function first(value: unknown) {
  return record(Array.isArray(value) ? value[0] : undefined);
}
function texts(value: unknown, fallback: unknown) {
  const values = Array.isArray(value) ? value.map((item) => text(record(item).text).trim()).filter(Boolean) : [];
  return [...new Set(values.length ? values : [text(fallback).trim()].filter(Boolean))];
}

// Text assets are alternatives, not separate ads. Story fields are only a legacy fallback.
export function copyFromCreative(value: unknown) {
  const raw = record(value);
  const story = record(raw.object_story_spec);
  const link = record(story.link_data);
  const video = record(story.video_data);
  const feed = record(raw.asset_feed_spec);
  const cta = record(link.call_to_action ?? video.call_to_action);
  const variants = {
    primaryTexts: texts(feed.bodies, link.message ?? video.message ?? raw.body),
    headlines: texts(feed.titles, link.name ?? video.title ?? raw.title),
    descriptions: texts(feed.descriptions, link.description ?? video.link_description)
  };
  const copy = normalizeBatchCopy({
    primaryText: "",
    headline: "",
    description: "",
    primaryTexts: variants.primaryTexts.slice(0, MAX_COPY_VARIANTS),
    headlines: variants.headlines.slice(0, MAX_COPY_VARIANTS),
    descriptions: variants.descriptions.slice(0, MAX_COPY_VARIANTS),
    landingUrl: text(first(feed.link_urls).website_url ?? link.link ?? record(cta.value).link ?? raw.object_url),
    callToAction:
      text(
        (Array.isArray(feed.call_to_action_types) ? feed.call_to_action_types[0] : undefined) ??
          cta.type ??
          raw.call_to_action_type
      ) || "SHOP_NOW",
    pageId: text(story.page_id) || text(raw.effective_object_story_id).split("_")[0],
    instagramId: text(story.instagram_user_id ?? story.instagram_actor_id),
    urlTags: text(raw.url_tags)
  });
  return { copy, truncated: Object.values(variants).some((items) => items.length > MAX_COPY_VARIANTS) };
}

export function templateCopySources(
  ads: { id: string; name: string; status: string; creative: unknown }[]
): BatchTemplateCopySource[] {
  return ads
    .filter((ad) => !["DELETED", "ARCHIVED"].includes(ad.status))
    .map(({ creative, ...ad }) => ({ ...ad, ...copyFromCreative(creative) }))
    .filter((ad) => ad.copy.primaryTexts!.length || ad.copy.headlines!.length || ad.copy.descriptions!.length)
    .sort(
      (a, b) =>
        Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
    );
}
