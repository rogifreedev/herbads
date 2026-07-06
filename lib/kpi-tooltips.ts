const kpiTooltipKeys: Record<string, string> = {
  "Creative Score": "creativeScore",
  Spend: "spend",
  ROAS: "roas",
  Sales: "sales",
  Conversions: "conversions",
  "Conv. Value": "convValue",
  "Outbound CVR": "outboundCvr",
  CTR: "ctr",
  CPC: "cpc",
  CPM: "cpm",
  CPA: "cpa",
  CPP: "cpp",
  Reach: "reach",
  "Impr.": "imprAbbr",
  Impressions: "impressions",
  Frequency: "frequency",
  Hook: "hookRate",
  Hookrate: "hookRate",
  Hold: "holdRate",
  Holdrate: "holdRate",
  "Outbound Clicks": "outboundClicks",
  "Avg. Score": "avgScore",
  "AI analysiert": "aiAnalyzed"
};

export function kpiTooltipKey(label: string) {
  return kpiTooltipKeys[label] ?? null;
}
