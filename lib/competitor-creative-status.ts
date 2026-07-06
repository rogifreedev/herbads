import type { Translator } from "@/lib/i18n-types";

// Crawler delivers stable status values ("active" | "disabled" | "inactive" | ...);
// translation happens at the render site via the "competitors" namespace.
// Unknown raw statuses are DB values and rendered untranslated.
export function competitorCreativeStatusLabel(status: string | null | undefined, t: Translator) {
  if (status === "disabled" || status === "inactive") return t("statusDisabled");
  if (status === "active") return t("statusActive");
  return status || t("statusUnknown");
}

export function isCompetitorCreativeDisabled(status: string | null | undefined) {
  return status === "disabled" || status === "inactive";
}
