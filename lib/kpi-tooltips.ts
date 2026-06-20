export const kpiTooltips: Record<string, string> = {
  "Creative Score": "Gesamtscore aus Performance-Komponenten wie ROAS, CPA, CTR, Outbound CVR, Video-Rates, Conversion-Volumen und Datenqualitaet. 100 ist sehr stark.",
  Spend: "Gesamtausgaben im ausgewaehlten Zeitraum laut Meta Insights.",
  ROAS: "Return on Ad Spend: Conversion Value geteilt durch Spend. Beispiel: 3,0 bedeutet 3 EUR Umsatz pro 1 EUR Werbekosten.",
  Sales: "Anzahl gemessener Kaeufe bzw. Purchase-Conversions im Zeitraum.",
  Conversions: "Anzahl gemessener Kaeufe bzw. Purchase-Conversions im Zeitraum.",
  "Conv. Value": "Gesamter gemessener Conversion-Wert bzw. Umsatz aus den Meta-Insights.",
  "Outbound CVR": "Purchase-Rate nach Outbound Clicks: Purchases geteilt durch Outbound Clicks. Zeigt, wie gut Klicks zu Kaeufen werden.",
  CTR: "Click-Through-Rate: Klicks geteilt durch Impressions. Misst, wie stark das Creative Aufmerksamkeit in Klicks umwandelt.",
  CPC: "Cost per Click: Spend geteilt durch Klicks. Niedriger ist in der Regel besser, muss aber mit Lead-/Kaufqualitaet bewertet werden.",
  CPM: "Cost per Mille: Kosten pro 1.000 Impressions. Zeigt, wie teuer die Auslieferung ist.",
  CPA: "Cost per Acquisition/Purchase: Spend geteilt durch Purchases. Niedriger ist besser, sofern die Conversion-Qualitaet passt.",
  CPP: "Cost per Purchase: Spend geteilt durch Purchases.",
  Reach: "Einzigartige Personen, die das Creative im Zeitraum erreicht hat.",
  "Impr.": "Impressions: Anzahl aller Ausspielungen. Eine Person kann mehrere Impressions erzeugen.",
  Impressions: "Anzahl aller Ausspielungen. Eine Person kann mehrere Impressions erzeugen.",
  Frequency: "Durchschnittliche Anzahl der Ausspielungen pro erreichter Person: Impressions geteilt durch Reach.",
  Hook: "Video-Hook-Rate: 3-Sekunden-Views geteilt durch Impressions. Zeigt, ob der Einstieg stoppt.",
  Hold: "Video-Hold-Rate: ThruPlays geteilt durch 3-Sekunden-Views. Zeigt, wie gut das Video nach dem Hook haelt.",
  Hookrate: "Video-Hook-Rate: 3-Sekunden-Views geteilt durch Impressions. Zeigt, ob der Einstieg stoppt.",
  Holdrate: "Video-Hold-Rate: ThruPlays geteilt durch 3-Sekunden-Views. Zeigt, wie gut das Video nach dem Hook haelt.",
  "Outbound Clicks": "Klicks, die Nutzer aus Meta heraus auf eine externe Zielseite fuehren. Fallback historisch: Link Clicks.",
  "Avg. Score": "Durchschnittlicher Creative Performance Score ueber die sichtbaren bzw. ausgewerteten Creatives.",
  "AI analysiert": "Anzahl Creatives, fuer die bereits eine AI Creative Analyse gespeichert ist."
};

export function kpiTooltip(label: string) {
  return kpiTooltips[label] ?? null;
}
