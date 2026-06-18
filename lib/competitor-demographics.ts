export type CompetitorReachBreakdownRow = {
  location: string;
  ageRange: string;
  gender: string;
  reach: number;
};

export type CompetitorLocationReach = {
  location: string;
  reach: number;
};

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export function getCompetitorTargetLocations(signals: Record<string, unknown>) {
  const targetLocations = Array.isArray(signals.targetLocations) ? signals.targetLocations : [];
  return uniqueStrings(
    targetLocations.map((item) => {
      if (!item || typeof item !== "object" || !("location" in item)) return null;
      return cleanString((item as Record<string, unknown>).location);
    })
  );
}

export function getCompetitorRawTransparencyLocations(signals: Record<string, unknown>) {
  const rawSectionPreview = cleanString(signals.rawSectionPreview);
  if (!rawSectionPreview) return [];

  const lines = rawSectionPreview
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const locations: Array<string | null> = [];

  for (let index = 0; index + 2 < lines.length; index += 1) {
    if (lines[index + 1] === "Country" && /^(Included|Excluded)$/i.test(lines[index + 2])) {
      locations.push(lines[index]);
    }
  }

  const deliveryIndex = lines.indexOf("EU ad delivery");
  const breakdownHeaderIndex = lines.findIndex((line, index) =>
    index > deliveryIndex &&
    line === "Location" &&
    lines[index + 1] === "Age Range" &&
    lines[index + 2] === "Gender" &&
    lines[index + 3] === "Reach"
  );

  if (breakdownHeaderIndex >= 0) {
    for (let index = breakdownHeaderIndex + 4; index + 3 < lines.length; index += 4) {
      const location = cleanString(lines[index]);
      const ageRange = cleanString(lines[index + 1]);
      const gender = cleanString(lines[index + 2]);
      const reach = Number(String(lines[index + 3]).replace(/[^\d.-]/g, ""));
      if (!location || !ageRange || !gender || !Number.isFinite(reach)) break;
      locations.push(location);
    }
  }

  return uniqueStrings(locations);
}

export function getCompetitorReachBreakdown(signals: Record<string, unknown>) {
  const reachBreakdown = Array.isArray(signals.reachBreakdown) ? signals.reachBreakdown : [];
  return reachBreakdown
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const reach = Number(record.reach);
      const location = cleanString(record.location) ?? "EU";
      return {
        location,
        ageRange: cleanString(record.ageRange) ?? "-",
        gender: cleanString(record.gender) ?? "-",
        reach: Number.isFinite(reach) ? reach : 0
      };
    })
    .filter((item): item is CompetitorReachBreakdownRow => Boolean(item));
}

export function getCompetitorDeliveryLocations(signals: Record<string, unknown>, fallbackLocations: string[] = []) {
  return uniqueStrings([
    ...fallbackLocations,
    ...getCompetitorTargetLocations(signals),
    ...getCompetitorReachBreakdown(signals).map((row) => row.location),
    ...getCompetitorRawTransparencyLocations(signals)
  ]);
}

export function getCompetitorReachByLocation(signals: Record<string, unknown>) {
  const totals = new Map<string, number>();
  for (const row of getCompetitorReachBreakdown(signals)) {
    totals.set(row.location, (totals.get(row.location) ?? 0) + row.reach);
  }

  return Array.from(totals.entries())
    .map(([location, reach]) => ({ location, reach }))
    .sort((a, b) => b.reach - a.reach || a.location.localeCompare(b.location));
}
