import "server-only";

import { normalizeExplicitAngle } from "@/lib/creative-angles";

function normalizeAngleSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpecificCompetitorAngle(value: string) {
  const normalized = normalizeAngleSearchText(value);
  if (!normalized) return null;

  const hasSupermarketSignal = normalized.includes("supermarkt");
  const hasCraftSignal = ["handwerk", "manufaktur", "profispeck", "blindtest"].some((signal) => normalized.includes(signal));
  if (hasSupermarketSignal && hasCraftSignal) return "Supermarkt vs Handwerk";

  const hasFounderSignal = ["founder", "gruender", "grunder", "inhaber", "familienbetrieb"].some((signal) => normalized.includes(signal));
  const hasStorySignal = ["story", "geschichte", "herkunft", "tradition", "mission"].some((signal) => normalized.includes(signal));
  if (hasFounderSignal || hasStorySignal) return "Founderstory";

  return null;
}

function hasComparisonSignal(value: string) {
  const normalized = normalizeAngleSearchText(value);
  return /\b(vs\.?|versus)\b/i.test(value) || normalized.includes("gegen") || normalized.includes("statt") || normalized.includes("im vergleich");
}

function shortenSpecificAngle(value: string) {
  const normalized = value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(" ");
  const short = words.length > 4 ? words.slice(0, 4).join(" ") : normalized;
  return short.length > 36 ? `${short.slice(0, 33).trim()}...` : short;
}

function competitorTaxonomyLabel(value: string) {
  const taxonomyAngle = normalizeExplicitAngle(value);
  if (!taxonomyAngle) return null;
  if (taxonomyAngle === "Founder / Story") return "Founderstory";
  if (taxonomyAngle === "Vergleich" && hasComparisonSignal(value)) return shortenSpecificAngle(value);
  return taxonomyAngle;
}

export function normalizeCompetitorAngle(value: string | null | undefined) {
  const angle = value?.trim();
  if (!angle) return null;

  return normalizeSpecificCompetitorAngle(angle) ?? competitorTaxonomyLabel(angle) ?? shortenSpecificAngle(angle);
}
