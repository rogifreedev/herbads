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

  return null;
}

export function normalizeCompetitorAngle(value: string | null | undefined) {
  const angle = value?.trim();
  if (!angle) return null;

  return normalizeSpecificCompetitorAngle(angle) ?? normalizeExplicitAngle(angle) ?? angle;
}
