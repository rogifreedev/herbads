export const mockClients = [
  {
    id: "herb-demo",
    name: "Herb Demo Account",
    adAccountId: "act_123456789",
    status: "active"
  },
  {
    id: "skincare-brand",
    name: "Skincare Brand",
    adAccountId: "act_987654321",
    status: "active"
  },
  {
    id: "fitness-shop",
    name: "Fitness Shop",
    adAccountId: "act_456789123",
    status: "paused"
  }
];

export const dashboardMetrics = [
  { label: "Spend", value: "48.240 €", change: "+12,4%", tone: "positive" },
  { label: "ROAS", value: "3,42", change: "+0,38", tone: "positive" },
  { label: "Aktive Creatives", value: "184", change: "29 neu", tone: "neutral" },
  { label: "AI Analysen", value: "71%", change: "+18%", tone: "positive" }
] as const;

export const creativeRows = [
  { name: "UGC Hook - Problem/Solution", type: "Video", ctr: "2,84%", roas: "4,7", status: "Top Performer" },
  { name: "Offer Static - 20% Rabatt", type: "Image", ctr: "1,92%", roas: "2,8", status: "Stable" },
  { name: "Product Demo Reel", type: "Video", ctr: "3,11%", roas: "3,9", status: "Testing" }
];

export const knowledgeDocuments = [
  { title: "Brand Guidelines 2026", type: "Branding", status: "Ready" },
  { title: "Zielgruppen Research", type: "Audience", status: "Ready" },
  { title: "Claims und No-Gos", type: "Compliance", status: "Indexing" }
];
