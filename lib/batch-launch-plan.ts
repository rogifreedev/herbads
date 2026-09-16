import type {
  BatchAdGroup,
  BatchCampaign,
  BatchLaunchCopy,
  BatchLaunchPreset,
  BatchMediaFile,
  BatchUploadedMedia
} from "@/lib/batch-launch-types";
import type { BatchTemplate } from "@/lib/batch-launch-types";

export function batchAdsetName(folderName: string, date = new Date()) {
  const day = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
  return `${day}_${folderName.trim()}`;
}

export function settingsFromAdset(template: BatchTemplate | undefined, currency: string) {
  const targeting = template?.raw.targeting as
    | { geo_locations?: { countries?: string[] }; locales?: number[] }
    | undefined;
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const budget = Number(template?.raw.daily_budget ?? 0);
  return {
    dailyBudget: Number.isSafeInteger(budget) && budget > 0 ? (budget / 10 ** digits).toFixed(digits) : "",
    countries: [...(targeting?.geo_locations?.countries ?? [])],
    locales: (targeting?.locales ?? []).map((id) => ({ id, name: String(id) }))
  };
}

export function validateLaunchActivation(
  activate: unknown,
  campaign: BatchCampaign,
  confirmedBudget?: Pick<BatchCampaign, "dailyBudget" | "lifetimeBudget">
) {
  if (activate !== undefined && typeof activate !== "boolean") throw new Error("Ungueltiger Aktivierungsstatus.");
  if (activate && campaign.status !== "ACTIVE")
    throw new Error(
      "Direkte Aktivierung erfordert eine bereits aktive Kampagne. Bestehende Kampagnen werden nicht aktiviert."
    );
  if (
    activate &&
    (!confirmedBudget ||
      confirmedBudget.dailyBudget !== campaign.dailyBudget ||
      confirmedBudget.lifetimeBudget !== campaign.lifetimeBudget)
  )
    throw new Error(
      "Das Kampagnenbudget hat sich geaendert oder wurde nicht bestaetigt. Bitte die Seite neu laden und die Aktivierung erneut bestaetigen."
    );
}

export const MAX_BATCH_FILES = 100;
export const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " "
  );

export function mediaPlacement(width: number | null, height: number | null): BatchMediaFile["placement"] {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.04) return "story";
  if (Math.abs(ratio - 1) < 0.05 || Math.abs(ratio - 4 / 5) < 0.05) return "feed";
  return "unknown";
}

function normalizeMediaPath(path: string) {
  return path
    .normalize("NFKC")
    .toLowerCase()
    .split("/")
    .map((part) =>
      part
        .replace(
          /(?<![\p{L}\p{N}])(?:1[\s_:x\u00d7-]+1|4[\s_:x\u00d7-]+5|9[\s_:x\u00d7-]+16|1080\s*[x\u00d7]\s*(?:1080|1350|1920))(?![\p{L}\p{N}])/gu,
          " "
        )
        .replace(/(?<![\p{L}\p{N}])(?:feed|stories|story|reels|square|portrait)(?![\p{L}\p{N}])/gu, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
    )
    .filter(Boolean)
    .join("/");
}

export function batchMediaScope(file: BatchMediaFile) {
  return normalizeMediaPath(file.path.split("/").slice(0, -1).join("/"));
}

function motifKey(file: BatchMediaFile) {
  // Keep motif/version numbers and non-format folders; never infer pairs from export order.
  return normalizeMediaPath(file.path.replace(/\.[^.\/]+$/, ""));
}

export function groupBatchMedia(files: BatchMediaFile[]): BatchAdGroup[] {
  const buckets = new Map<string, BatchMediaFile[]>();
  for (const file of files) {
    const key = `${file.kind}:${motifKey(file)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), file]);
  }
  return [...buckets.values()].flatMap((bucket) => {
    const feed = bucket.filter((file) => file.placement === "feed");
    const story = bucket.filter((file) => file.placement === "story");
    if (bucket.length === 2 && feed.length === 1 && story.length === 1) {
      return [
        { id: feed[0].id, name: feed[0].name.replace(/\.[^.]+$/, ""), feedFileId: feed[0].id, storyFileId: story[0].id }
      ];
    }
    return bucket.map((file) => ({
      id: file.id,
      name: file.name.replace(/\.[^.]+$/, ""),
      feedFileId: file.placement === "story" ? null : file.id,
      storyFileId: file.placement === "story" ? file.id : null
    }));
  });
}

export function validateGroups(groups: BatchAdGroup[], files: BatchMediaFile[]) {
  if (!Array.isArray(groups) || !groups.length || groups.length > MAX_BATCH_FILES)
    throw new Error("Mindestens eine Anzeige auswaehlen.");
  const known = new Map(files.map((file) => [file.id, file]));
  const used = new Set<string>();
  const ids = new Set<string>();
  for (const group of groups) {
    if (
      !group ||
      typeof group.id !== "string" ||
      !/^[\w-]{1,100}$/.test(group.id) ||
      ["__proto__", "constructor", "prototype"].includes(group.id) ||
      ids.has(group.id)
    )
      throw new Error("Ungueltige Anzeigen-Zuordnung.");
    ids.add(group.id);
    if (typeof group.name !== "string" || !group.name.trim() || group.name.length > 200)
      throw new Error("Anzeigenname fehlt oder ist zu lang.");
    if (group.primaryText !== undefined && (typeof group.primaryText !== "string" || group.primaryText.length > 10000))
      throw new Error("Ungueltiger Primaertext der Anzeige.");
    const selected = [group.feedFileId, group.storyFileId].filter((id): id is string => Boolean(id));
    if (!selected.length) throw new Error("Jede Anzeige braucht mindestens eine Datei.");
    for (const id of selected) {
      if (!known.has(id) || used.has(id)) throw new Error("Datei ist nicht im Batch oder mehrfach zugeordnet.");
      used.add(id);
    }
    if (selected.length === 2) {
      if (known.get(selected[0])!.kind !== known.get(selected[1])!.kind)
        throw new Error("Bild und Video koennen nicht dieselbe Anzeige bilden.");
      if (known.get(group.storyFileId!)!.placement !== "story")
        throw new Error("Die Story-Variante muss im Format 9:16 vorliegen.");
      if (known.get(group.feedFileId!)!.placement !== "feed")
        throw new Error("Die Feed-Variante muss im Format 1:1 oder 4:5 vorliegen.");
    }
  }
  return files.filter((file) => used.has(file.id));
}

export function budgetMinorUnits(value: string, currency: string) {
  const amount = Number(value);
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = Math.round(amount * 10 ** digits);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(minor) ||
    minor <= 0 ||
    Math.abs(minor / 10 ** digits - amount) > 1e-8
  ) {
    throw new Error("Ungueltiges Tagesbudget fuer die Kontowaehrung.");
  }
  return minor;
}

export function validatePreset(settings: Omit<BatchLaunchPreset, "id" | "name">) {
  if (
    !settings ||
    !Array.isArray(settings.countries) ||
    !settings.countries.length ||
    settings.countries.length > 100 ||
    settings.countries.some((code) => !COUNTRY_CODES.includes(code))
  )
    throw new Error("Mindestens ein gueltiges Land auswaehlen.");
  if (
    !Array.isArray(settings.locales) ||
    settings.locales.length > 50 ||
    settings.locales.some(
      (locale) =>
        !locale ||
        !Number.isSafeInteger(locale.id) ||
        locale.id <= 0 ||
        typeof locale.name !== "string" ||
        locale.name.length > 120
    )
  )
    throw new Error("Ungueltige Sprachauswahl.");
  if (typeof settings.dailyBudget !== "string" || settings.dailyBudget.length > 20)
    throw new Error("Ungueltiges Budget.");
}

export function validateCopy(copy: BatchLaunchCopy) {
  const keys: (keyof BatchLaunchCopy)[] = [
    "primaryText",
    "headline",
    "description",
    "landingUrl",
    "callToAction",
    "pageId",
    "instagramId",
    "urlTags"
  ];
  if (!copy || keys.some((key) => typeof copy[key] !== "string")) throw new Error("Ungueltige Anzeigentexte.");
  if (!copy.primaryText?.trim() || copy.primaryText.length > 10000)
    throw new Error("Primaerer Text fehlt oder ist zu lang.");
  if (!copy.headline?.trim() || copy.headline.length > 255 || copy.description.length > 1000)
    throw new Error("Headline fehlt oder ist zu lang.");
  if (!/^\d+$/.test(copy.pageId) || (copy.instagramId && !/^\d+$/.test(copy.instagramId)))
    throw new Error("Facebook-Seite oder Instagram-ID ist ungueltig.");
  const url = new URL(copy.landingUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Ungueltige Ziel-URL.");
  if (!/^[A-Z_]{3,60}$/.test(copy.callToAction) || copy.urlTags.length > 2000)
    throw new Error("Ungueltiger Call-to-Action oder URL-Parameter.");
}

export function buildAdSetPayload(
  name: string,
  campaign: BatchCampaign,
  template: Record<string, unknown>,
  settings: Omit<BatchLaunchPreset, "id" | "name">,
  currency: string
) {
  validatePreset(settings);
  if (typeof name !== "string" || !name.trim() || name.length > 200)
    throw new Error("Adset-Name fehlt oder ist zu lang.");
  if (!["OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_LEADS", "CONVERSIONS", "LINK_CLICKS"].includes(campaign.objective))
    throw new Error("Diese Kampagne unterstuetzt keine Website-Batch-Anzeigen.");
  const promoted = template.promoted_object as Record<string, unknown> | undefined;
  if (promoted?.product_set_id || promoted?.product_catalog_id || promoted?.application_id)
    throw new Error("Katalog- und App-Adsets werden nicht als Batch-Vorlage unterstuetzt.");
  if (template.destination_type && !["WEBSITE", "UNDEFINED"].includes(String(template.destination_type)))
    throw new Error("Bitte ein Website-Adset als Vorlage auswaehlen.");
  if (template.is_dynamic_creative) throw new Error("Bitte ein Adset ohne Dynamic Creative als Vorlage auswaehlen.");
  if (!template.optimization_goal || !template.billing_event)
    throw new Error("Optimierungsziel oder Abrechnungsart fehlt in der Vorlage.");
  const targeting = structuredClone(template.targeting ?? {}) as Record<string, unknown>;
  const originalCountries = (targeting.geo_locations as { countries?: string[] } | undefined)?.countries ?? [];
  const sameCountries =
    originalCountries.length > 0 &&
    new Set(originalCountries).size === new Set(settings.countries).size &&
    originalCountries.every((country) => settings.countries.includes(country));
  if (!sameCountries) {
    targeting.geo_locations = { countries: [...new Set(settings.countries)] };
    delete targeting.excluded_geo_locations;
  }
  if (settings.locales.length) targeting.locales = [...new Set(settings.locales.map((locale) => locale.id))];
  else delete targeting.locales;
  const result: Record<string, unknown> = {
    name: name.trim(),
    campaign_id: campaign.id,
    status: "PAUSED",
    targeting,
    optimization_goal: template.optimization_goal,
    billing_event: template.billing_event,
    destination_type: "WEBSITE"
  };
  for (const key of ["promoted_object", "attribution_spec", "dsa_beneficiary", "dsa_payor"]) {
    if (template[key] !== undefined && template[key] !== null) result[key] = template[key];
  }
  if (!campaign.dailyBudget && !campaign.lifetimeBudget) {
    result.daily_budget = budgetMinorUnits(settings.dailyBudget, currency);
    result.bid_strategy = template.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP";
    if (result.bid_strategy !== "LOWEST_COST_WITHOUT_CAP") {
      if (!template.bid_amount) throw new Error("Gebotslimit fehlt in der Vorlage.");
      result.bid_amount = template.bid_amount;
    }
  }
  return result;
}

export function buildCreativePayload(
  group: BatchAdGroup,
  files: BatchMediaFile[],
  uploaded: Record<string, BatchUploadedMedia>,
  copy: BatchLaunchCopy
) {
  copy = { ...copy, primaryText: group.primaryText?.trim() || copy.primaryText };
  validateCopy(copy);
  const selected = [group.feedFileId, group.storyFileId].filter((id): id is string => Boolean(id));
  const file = files.find((item) => item.id === selected[0])!;
  const story: Record<string, unknown> = { page_id: copy.pageId };
  if (copy.instagramId) story.instagram_user_id = copy.instagramId;
  const base = { name: group.name, object_story_spec: story, url_tags: copy.urlTags };
  const cta = { type: copy.callToAction, value: { link: copy.landingUrl } };
  if (selected.length === 1) {
    const media = uploaded[selected[0]];
    if (file.kind === "image")
      story.link_data = {
        image_hash: media.imageHash,
        link: copy.landingUrl,
        message: copy.primaryText,
        name: copy.headline,
        description: copy.description,
        call_to_action: cta
      };
    else
      story.video_data = {
        video_id: media.videoId,
        image_url: media.thumbnailUrl,
        message: copy.primaryText,
        title: copy.headline,
        link_description: copy.description,
        call_to_action: cta
      };
    return base;
  }
  const label = file.kind === "image" ? "image_label" : "video_label";
  const assets = selected.map((id) => ({
    adlabels: [{ name: id === group.storyFileId ? "batch_story" : "batch_feed" }],
    ...(file.kind === "image"
      ? { hash: uploaded[id].imageHash }
      : { video_id: uploaded[id].videoId, thumbnail_url: uploaded[id].thumbnailUrl })
  }));
  return {
    ...base,
    asset_feed_spec: {
      [file.kind === "image" ? "images" : "videos"]: assets,
      ad_formats: [file.kind === "image" ? "SINGLE_IMAGE" : "SINGLE_VIDEO"],
      optimization_type: "PLACEMENT",
      bodies: [{ text: copy.primaryText }],
      titles: [{ text: copy.headline }],
      descriptions: [{ text: copy.description }],
      link_urls: [{ website_url: copy.landingUrl }],
      call_to_action_types: [copy.callToAction],
      asset_customization_rules: [
        {
          priority: 1,
          [label]: { name: "batch_story" },
          customization_spec: {
            publisher_platforms: ["facebook", "instagram", "messenger"],
            facebook_positions: ["story", "facebook_reels"],
            instagram_positions: ["story", "reels"],
            messenger_positions: ["story"]
          }
        },
        { priority: 2, [label]: { name: "batch_feed" }, customization_spec: { age_min: 13, age_max: 65 } }
      ]
    }
  };
}
