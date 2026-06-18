export function competitorCreativeStatusLabel(status: string | null | undefined) {
  if (status === "disabled" || status === "inactive") return "disabled";
  if (status === "active") return "aktiv";
  return status || "unknown";
}

export function isCompetitorCreativeDisabled(status: string | null | undefined) {
  return status === "disabled" || status === "inactive";
}
