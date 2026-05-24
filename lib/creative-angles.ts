import "server-only";

import { listClientCreatives, type CreativeInsightDateRange, type CreativeListItem } from "@/lib/creatives";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type JsonRecord = Record<string, unknown>;

type AnalysisRow = {
  creative_id: string | null;
  hook: string | null;
  summary: string | null;
  funnel_stage: string | null;
  target_audience_fit_score: number | string | null;
  brand_fit_score: number | string | null;
  clarity_score: number | string | null;
  scrollstopper_score: number | string | null;
  cta_score: number | string | null;
  raw: JsonRecord | null;
  created_at: string;
};

type AngleRule = {
  label: string;
  summary: string;
  strongKeywords?: string[];
  keywords: string[];
  supportingKeywords?: string[];
  antiKeywords?: string[];
  wrapper?: boolean;
};

export type CreativeAngleItem = {
  creativeId: string;
  creativeName: string;
  type: string;
  status: string;
  funnelStage: string | null;
  angle: string;
  reason: string;
  confidence: number;
  score: number;
  hook: string | null;
  primaryText: string | null;
  headline: string | null;
  spend: number;
  impressions: number;
  purchases: number;
  roas: number | null;
  ctr: number | null;
};

export type AngleInsight = {
  angle: string;
  summary: string;
  creativeCount: number;
  score: number;
  avgCreativeScore: number;
  avgConfidence: number;
  spend: number;
  impressions: number;
  purchases: number;
  roas: number | null;
  ctr: number | null;
  hookRate: number | null;
  outboundCvr: number | null;
  formats: string[];
  funnelStages: string[];
  topHooks: string[];
  exampleCreatives: Array<{ id: string; name: string; score: number }>;
};

export type CreativeAnglesOverview = {
  angles: AngleInsight[];
  creatives: CreativeAngleItem[];
  totals: {
    angles: number;
    creatives: number;
    analyzedCreatives: number;
    avgScore: number;
  };
  error: string | null;
};

const angleRules: AngleRule[] = [
  {
    label: "Pain-Point / Problem-Loesung",
    summary: "Startet mit Schmerz, Friktion oder Einwand und positioniert das Produkt danach als Loesung.",
    strongKeywords: ["kennst du das", "hast du auch", "endlich", "nie wieder", "problem", "loesung", "lösung"],
    keywords: ["schmerz", "nervt", "frustriert", "keine lust", "zu kompliziert", "schwierig", "sorgen", "statt", "ohne", "einfacher", "stress"],
    supportingKeywords: ["schnell", "leicht", "unkompliziert"]
  },
  {
    label: "Benefit / Transformation",
    summary: "Verkauft das Ergebnis, die Verbesserung oder den Zustand nach dem Kauf statt das Feature.",
    strongKeywords: ["damit du", "macht jeden", "macht dein", "verwandelt", "48 stunden", "niemand etwas von dir will", "outcome"],
    keywords: ["mehr", "weniger", "besser", "heller", "entspannter", "entspannt", "geniessen", "genießen", "ergebnis", "gefuehl", "gefühl", "wirkung", "transformation"],
    supportingKeywords: ["vorteil", "perfekt fuer", "ideal fuer"]
  },
  {
    label: "Feature / USP",
    summary: "Fuehrt ueber ein konkretes Produktmerkmal, eine technische Besonderheit oder einen echten USP.",
    strongKeywords: ["designed in italy", "dimmable", "0.1%", "patentiert", "einzigartig", "usp", "240 led", "led-lumen"],
    keywords: ["feature", "funktion", "technologie", "material", "zutaten", "lumen", "led", "design", "bio", "premium", "original", "hergestellt", "qualitaet", "qualität"],
    supportingKeywords: ["produkt", "sortiment", "variante", "auswahl"]
  },
  {
    label: "Social Proof / UGC",
    summary: "Nutzt Kundenstimmen, echte Nutzung, Reviews oder Beliebtheit als Kaufargument.",
    strongKeywords: ["ugc", "kunden sagen", "echter kunde", "echte kundin", "bewertung", "bewertungen", "review", "testimonial"],
    keywords: ["kunden", "erfahrung", "erfahrungen", "empfohlen", "empfehlen", "beliebt", "community", "fans", "rezension", "rezensionen", "tausende", "12.000"],
    supportingKeywords: ["liebling", "bekannt"]
  },
  {
    label: "Authority / Expert",
    summary: "Leiht Glaubwuerdigkeit durch Expert:innen, Auszeichnungen, Zertifizierungen oder Fachwissen.",
    strongKeywords: ["empfohlen von", "entwickelt mit", "sommelier", "physiotherapeut", "experte", "expertin", "meister"],
    keywords: ["arzt", "aerztin", "ärztin", "koch", "winzer", "wissenschaft", "studie", "zertifiziert", "ausgezeichnet", "award", "praemiert", "prämiert"],
    supportingKeywords: ["kontrolliert", "garantie", "vertrauen"]
  },
  {
    label: "Scarcity / Urgency",
    summary: "Erzeugt Handlungsdruck ueber limitierte Verfuegbarkeit, Countdown oder kurze Aktionsdauer.",
    strongKeywords: ["nur noch", "bis sonntag", "letzte", "limitiert", "solange der vorrat", "countdown", "aktion endet"],
    keywords: ["kurze zeit", "heute", "morgen", "sichern", "ausverkauft", "verfuegbar", "verfügbar", "jahrgang", "restbestand"],
    supportingKeywords: ["aktion", "sale"]
  },
  {
    label: "Founder / Story",
    summary: "Erzaehlt Gruendung, Motivation, Herkunft, Handwerk oder Brand-Heritage als Vertrauensanker.",
    strongKeywords: ["warum ich", "ich habe", "wir haben angefangen", "gegruendet", "gegründet", "gruender", "gründer", "founder"],
    keywords: ["geschichte", "seit", "tradition", "familie", "familien", "generation", "handwerk", "herkunft", "regional", "suedtirol", "südtirol", "heimat", "hof"],
    supportingKeywords: ["anders gemacht", "aus liebe", "unsere mission"]
  },
  {
    label: "Identity / For People Like You",
    summary: "Spricht ein Selbstbild oder eine Zugehoerigkeit an: fuer Menschen wie dich.",
    strongKeywords: ["fuer menschen", "für menschen", "fuer alle die", "für alle die", "wenn du jemand bist", "people like you"],
    keywords: ["ritual", "statussymbol", "kenner", "geniesser", "genießer", "fuer dich", "für dich", "dein lifestyle", "wer liebt", "menschen die"],
    supportingKeywords: ["bewusst", "anspruch", "nicht fuer jeden", "nicht für jeden"]
  },
  {
    label: "Before / After",
    summary: "Zeigt einen klaren Vorher-Nachher-Kontrast oder eine sichtbare Veraenderung.",
    strongKeywords: ["vorher nachher", "before after", "vorher", "nachher"],
    keywords: ["renovation", "renovierung", "makeover", "verwandlung", "vergleich vorher", "transformation", "davor", "danach"],
    supportingKeywords: ["raum", "zimmer", "sichtbar"]
  },
  {
    label: "Vergleich",
    summary: "Positioniert das Angebot gegen Alternativen, Preispunkte oder Wettbewerber.",
    strongKeywords: ["vs", "versus", "im vergleich", "warum wir keine", "3x teurer", "alternative zu"],
    keywords: ["statt", "besser als", "mehr als", "gegenueber", "gegenüber", "vergleich", "premium-brand", "konkurrenz", "andere"],
    supportingKeywords: ["preis", "aufpreis", "guenstiger", "günstiger"]
  },
  {
    label: "Education / Myth-Busting",
    summary: "Fuehrt ueber Wissen, Aha-Moment, Mythos oder Erklaerung in das Produkt.",
    strongKeywords: ["3 dinge", "was du ueber", "was du über", "mythos", "mythen", "wusstest du", "so erkennst du"],
    keywords: ["lernen", "erklaert", "erklärt", "guide", "tipps", "wissen", "warum", "fakten", "nicht weisst", "nicht weißt", "direktsaft"],
    supportingKeywords: ["aufklaerung", "aufklärung", "ratgeber"]
  },
  {
    label: "Aspiration / Lifestyle",
    summary: "Verkauft Lebensgefuehl, Aesthetik, Ritual oder Wunschwelt statt rationales Argument.",
    strongKeywords: ["lebensgefuehl", "lebensgefühl", "wellness", "resort", "auszeit", "dolce vita"],
    keywords: ["genussmoment", "momente", "entspannung", "urlaub", "luxus", "stil", "atmosphaere", "atmosphäre", "traum", "ritual", "zuhause"],
    supportingKeywords: ["genuss", "geschmack", "aroma", "appetit"]
  },
  {
    label: "Negative / Loss Aversion",
    summary: "Hebelt Verlustangst, Fehlervermeidung oder Kosten des Nicht-Handelns.",
    strongKeywords: ["was du verlierst", "was du verpasst", "warum du nicht", "riskierst", "fehler", "verpasst du"],
    keywords: ["verlust", "schadet", "falsch", "teuer", "vorsicht", "nicht mehr", "nie wieder", "ohne"],
    supportingKeywords: ["sparsam einsetzen", "warnung"]
  },
  {
    label: "Seasonal / Event",
    summary: "Saisonaler oder eventbasierter Wrapper; nur Haupt-Angle, wenn kein staerkerer strategischer Angle erkennbar ist.",
    strongKeywords: ["vatertag", "weihnachten", "ostern", "saisonstart", "opening", "black friday", "muttertag"],
    keywords: ["sommer", "winter", "herbst", "fruehling", "frühling", "feiertag", "event", "geburtstag", "fest", "anlass"],
    supportingKeywords: ["geschenk", "box", "set", "paket"],
    wrapper: true
  }
];

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestAnalyses(rows: AnalysisRow[]) {
  const map = new Map<string, AnalysisRow>();
  for (const row of rows) {
    if (!row.creative_id || map.has(row.creative_id)) continue;
    map.set(row.creative_id, row);
  }
  return map;
}

function explicitAngle(analysis?: AnalysisRow) {
  const raw = analysis?.raw ?? {};
  return stringValue(raw.angle) || stringValue(raw.creativeAngle) || stringValue(raw.messagingAngle);
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(text: string, keyword: string) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return false;
  if (!/^[a-z0-9]+$/.test(normalizedKeyword)) return text.includes(normalizedKeyword);
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedKeyword)}([^a-z0-9]|$)`).test(text);
}

function searchFields(input: { creative: CreativeListItem; analysis?: AnalysisRow }) {
  return [
    { label: "Hook", text: normalizeSearchText(input.analysis?.hook ?? ""), weight: 2.4 },
    { label: "Headline", text: normalizeSearchText(input.creative.title ?? ""), weight: 1.8 },
    { label: "Primary Text", text: normalizeSearchText(input.creative.body ?? ""), weight: 1.2 },
    { label: "AI Summary", text: normalizeSearchText(input.analysis?.summary ?? ""), weight: 0.8 },
    { label: "Creative Name", text: normalizeSearchText(input.creative.name), weight: 0.6 }
  ].filter((field) => field.text);
}

function bestFieldMatch(fields: ReturnType<typeof searchFields>, keyword: string) {
  return fields
    .filter((field) => keywordMatches(field.text, keyword))
    .sort((a, b) => b.weight - a.weight)[0] ?? null;
}

function scoreRule(rule: AngleRule, fields: ReturnType<typeof searchFields>, index: number) {
  const matches: string[] = [];
  const antiMatches: string[] = [];
  let score = 0;

  const groups = [
    { keywords: rule.strongKeywords ?? [], weight: 4 },
    { keywords: rule.keywords, weight: 2 },
    { keywords: rule.supportingKeywords ?? [], weight: 1 }
  ];

  for (const group of groups) {
    for (const keyword of group.keywords) {
      if (matches.includes(keyword)) continue;
      const field = bestFieldMatch(fields, keyword);
      if (!field) continue;
      score += group.weight * field.weight;
      matches.push(keyword);
    }
  }

  for (const keyword of rule.antiKeywords ?? []) {
    const field = bestFieldMatch(fields, keyword);
    if (!field) continue;
    score -= 3 * field.weight;
    antiMatches.push(keyword);
  }

  return { rule, index, score, matches, antiMatches };
}

function normalizeExplicitAngle(value: string) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;

  const exact = angleRules.find((rule) => normalizeSearchText(rule.label) === normalized);
  if (exact) return exact.label;

  const aliases = [
    { label: "Pain-Point / Problem-Loesung", signals: ["pain", "problem", "loesung", "losung"] },
    { label: "Benefit / Transformation", signals: ["benefit", "transformation", "outcome", "nutzen"] },
    { label: "Feature / USP", signals: ["feature", "usp", "produktnutzen", "qualitaet", "qualitat"] },
    { label: "Social Proof / UGC", signals: ["social proof", "ugc", "beliebtheit", "kunden"] },
    { label: "Authority / Expert", signals: ["authority", "expert", "experte", "zertifiziert"] },
    { label: "Scarcity / Urgency", signals: ["scarcity", "urgency", "knappheit", "dringlichkeit"] },
    { label: "Founder / Story", signals: ["founder", "story", "herkunft", "tradition", "geschichte"] },
    { label: "Identity / For People Like You", signals: ["identity", "people like you", "selbstbild"] },
    { label: "Before / After", signals: ["before", "after", "vorher", "nachher"] },
    { label: "Vergleich", signals: ["vergleich", "vs", "alternative"] },
    { label: "Education / Myth-Busting", signals: ["education", "myth", "mythos", "wissen"] },
    { label: "Aspiration / Lifestyle", signals: ["aspiration", "lifestyle", "genuss", "geschmack"] },
    { label: "Negative / Loss Aversion", signals: ["negative", "loss", "verlust"] },
    { label: "Seasonal / Event", signals: ["seasonal", "event", "saison", "anlass", "geschenk"] }
  ];

  return aliases.find((alias) => alias.signals.some((signal) => normalized.includes(signal)))?.label ?? null;
}

function inferAngle(input: { creative: CreativeListItem; analysis?: AnalysisRow }) {
  const aiAngle = normalizeExplicitAngle(explicitAngle(input.analysis));
  if (aiAngle) {
    return { angle: aiAngle, confidence: 92, reason: "Aus vorhandener AI Analyse uebernommen und auf die strategische Angle-Taxonomie normalisiert." };
  }

  const fields = searchFields(input);
  if (fields.length === 0) {
    return { angle: "Unklar", confidence: 0, reason: "Kein Hook, Primary Text oder Titel vorhanden." };
  }

  const ranked = angleRules
    .map((rule, index) => scoreRule(rule, fields, index))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.matches.length - a.matches.length || a.index - b.index);
  const wrapper = ranked.find((item) => item.rule.wrapper && item.score >= 2.4);
  const coreRanked = ranked.filter((item) => !item.rule.wrapper);
  const best = coreRanked[0] ?? wrapper;

  if (!best || best.score < 2.4) {
    return {
      angle: "Unklarer Marketing Angle",
      confidence: 28,
      reason: "Kein ausreichend starkes strategisches Angle-Pattern erkannt; benoetigt manuelle Pruefung oder AI-Reanalyse."
    };
  }

  const confidence = Math.min(90, Math.round(35 + best.score * 6));
  const wrapperNote = wrapper && wrapper.rule.label !== best.rule.label ? ` Seasonal/Event wurde als Wrapper erkannt (${wrapper.matches.slice(0, 3).join(", ")}), aber nicht als Haupt-Angle gewertet.` : "";
  return {
    angle: best.rule.label,
    confidence,
    reason: `Erkannt durch strategische Signale: ${best.matches.slice(0, 5).join(", ")}.${wrapperNote}`
  };
}

function angleSummary(angle: string) {
  return angleRules.find((rule) => rule.label === angle)?.summary ?? "Fasst Anzeigen mit aehnlichem Messaging-Ansatz zusammen.";
}

function uniqueCompact(values: Array<string | null | undefined>, limit = 6) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].slice(0, limit);
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function roas(value: number, spend: number) {
  return spend > 0 ? value / spend : null;
}

function buildCreativeAngle(creative: CreativeListItem, analysis?: AnalysisRow): CreativeAngleItem {
  const detected = inferAngle({ creative, analysis });
  return {
    creativeId: creative.id,
    creativeName: creative.name,
    type: creative.type,
    status: creative.status,
    funnelStage: analysis?.funnel_stage ?? creative.funnelStage,
    angle: detected.angle,
    reason: detected.reason,
    confidence: detected.confidence,
    score: creative.performanceScore.score,
    hook: analysis?.hook ?? null,
    primaryText: creative.body,
    headline: creative.title,
    spend: creative.metrics.spend,
    impressions: creative.metrics.impressions,
    purchases: creative.metrics.purchases,
    roas: creative.metrics.roas,
    ctr: creative.metrics.ctr
  };
}

function buildAngleInsights(creatives: CreativeListItem[], items: CreativeAngleItem[]): AngleInsight[] {
  const creativesById = new Map(creatives.map((creative) => [creative.id, creative]));
  const groups = new Map<string, CreativeAngleItem[]>();
  for (const item of items) groups.set(item.angle, [...(groups.get(item.angle) ?? []), item]);

  return [...groups.entries()]
    .map(([angle, angleItems]) => {
      const sourceCreatives = angleItems.map((item) => creativesById.get(item.creativeId)).filter((creative): creative is CreativeListItem => Boolean(creative));
      const spend = sourceCreatives.reduce((sum, creative) => sum + creative.metrics.spend, 0);
      const impressions = sourceCreatives.reduce((sum, creative) => sum + creative.metrics.impressions, 0);
      const clicks = sourceCreatives.reduce((sum, creative) => sum + creative.metrics.clicks, 0);
      const outboundClicks = sourceCreatives.reduce((sum, creative) => sum + creative.metrics.outboundClicks, 0);
      const purchases = sourceCreatives.reduce((sum, creative) => sum + creative.metrics.purchases, 0);
      const purchaseValue = sourceCreatives.reduce((sum, creative) => sum + creative.metrics.purchaseValue, 0);
      const video3s = sourceCreatives.reduce((sum, creative) => sum + creative.metrics.video3sViews, 0);
      const avgCreativeScore = Math.round(angleItems.reduce((sum, item) => sum + item.score, 0) / angleItems.length);
      const avgConfidence = Math.round(angleItems.reduce((sum, item) => sum + item.confidence, 0) / angleItems.length);

      return {
        angle,
        summary: angleSummary(angle),
        creativeCount: angleItems.length,
        score: Math.round(avgCreativeScore * 0.75 + avgConfidence * 0.25),
        avgCreativeScore,
        avgConfidence,
        spend,
        impressions,
        purchases,
        roas: roas(purchaseValue, spend),
        ctr: rate(clicks, impressions),
        hookRate: rate(video3s, impressions),
        outboundCvr: rate(purchases, outboundClicks),
        formats: uniqueCompact(angleItems.map((item) => item.type), 5),
        funnelStages: uniqueCompact(angleItems.map((item) => item.funnelStage), 5),
        topHooks: uniqueCompact(angleItems.sort((a, b) => b.score - a.score).map((item) => item.hook), 4),
        exampleCreatives: angleItems
          .slice()
          .sort((a, b) => b.score - a.score || b.spend - a.spend)
          .slice(0, 4)
          .map((item) => ({ id: item.creativeId, name: item.creativeName, score: item.score }))
      };
    })
    .sort((a, b) => b.score - a.score || b.spend - a.spend || b.creativeCount - a.creativeCount);
}

export async function getCreativeAnglesOverview(clientId: string, dateRange?: CreativeInsightDateRange): Promise<CreativeAnglesOverview> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [{ creatives, error: creativesError }, { data: analyses, error: analysesError }] = await Promise.all([
      listClientCreatives(clientId, dateRange),
      supabase
        .from("creative_ai_analyses")
        .select("creative_id,hook,summary,funnel_stage,target_audience_fit_score,brand_fit_score,clarity_score,scrollstopper_score,cta_score,raw,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
    ]);

    const error = creativesError ?? analysesError?.message ?? null;
    if (error) throw new Error(error);

    const analysisByCreative = latestAnalyses((analyses ?? []) as AnalysisRow[]);
    const creativeAngles = creatives
      .map((creative) => buildCreativeAngle(creative, analysisByCreative.get(creative.id)))
      .sort((a, b) => b.score - a.score || b.spend - a.spend);
    const angles = buildAngleInsights(creatives, creativeAngles);
    const avgScore = creativeAngles.length > 0 ? Math.round(creativeAngles.reduce((sum, item) => sum + item.score, 0) / creativeAngles.length) : 0;

    return {
      angles,
      creatives: creativeAngles,
      totals: {
        angles: angles.length,
        creatives: creativeAngles.length,
        analyzedCreatives: analysisByCreative.size,
        avgScore
      },
      error: null
    };
  } catch (error) {
    return {
      angles: [],
      creatives: [],
      totals: { angles: 0, creatives: 0, analyzedCreatives: 0, avgScore: 0 },
      error: error instanceof Error ? error.message : "Creative Angles konnten nicht geladen werden."
    };
  }
}

export function getAngleDescription(angle: string) {
  return angleSummary(angle);
}

export function numericAnalysisScore(row: AnalysisRow | undefined) {
  if (!row) return null;
  const scores = [row.target_audience_fit_score, row.brand_fit_score, row.clarity_score, row.scrollstopper_score, row.cta_score]
    .map(nullableNumber)
    .filter((value): value is number => value !== null);
  return scores.length > 0 ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
}
