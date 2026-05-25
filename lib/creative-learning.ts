import "server-only";

import { getAdIdeasOverview, type AdIdea, type HookInsight } from "@/lib/ad-ideas";
import { getCreativeAnglesOverview, type AngleInsight } from "@/lib/creative-angles";
import { listClientCreatives, type CreativeListItem } from "@/lib/creatives";

type LearningSignal = "winner" | "loser" | "opportunity" | "fatigue";

export type LearningPattern = {
  id: string;
  signal: LearningSignal;
  title: string;
  insight: string;
  recommendation: string;
  score: number;
  confidence: number;
  evidence: string[];
  exampleCreatives: Array<{ id: string; name: string; score: number }>;
};

export type HookOpportunity = {
  id: string;
  hook: string;
  angle: string;
  format: string;
  predictedScore: number;
  confidence: number;
  why: string;
  sourcePattern: string;
};

export type IdeaPrediction = {
  idea: AdIdea;
  predictedScore: number;
  confidence: number;
  predictedCtr: string;
  predictedCpa: string;
  rationale: string[];
  risks: string[];
};

export type CreativeLearningOverview = {
  totals: {
    creatives: number;
    analyzedCreatives: number;
    angles: number;
    ideas: number;
    avgCreativeScore: number;
    learningConfidence: number;
  };
  winnerPatterns: LearningPattern[];
  loserPatterns: LearningPattern[];
  opportunities: LearningPattern[];
  fatigueWarnings: LearningPattern[];
  hookOpportunities: HookOpportunity[];
  predictions: IdeaPrediction[];
  error: string | null;
};

function todayMinus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function tokens(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9äöüß]+/gi, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

function similarity(left: string | null | undefined, right: string | null | undefined) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size);
}

function evidenceForAngle(angle: AngleInsight) {
  return [
    `${angle.creativeCount} Creatives`,
    `${Math.round(angle.spend)} EUR Spend`,
    `${Math.round(angle.impressions)} Impressions`,
    `Score ${angle.score}`,
    angle.roas !== null ? `ROAS ${angle.roas.toFixed(2)}` : null,
    angle.ctr !== null ? `CTR ${angle.ctr.toFixed(2)}%` : null
  ].filter(Boolean) as string[];
}

function confidenceFromSupport(input: { count: number; spend: number; impressions: number; analyzed: number }) {
  return clamp(
    18 +
    Math.min(input.count, 8) * 5 +
    Math.min(input.spend / 250, 12) * 2 +
    Math.min(input.impressions / 5000, 10) * 1.5 +
    Math.min(input.analyzed, 20)
  );
}

function buildWinnerPatterns(angles: AngleInsight[]) {
  return angles
    .filter((angle) => angle.creativeCount >= 1 && angle.score >= 60 && angle.spend > 0)
    .slice(0, 5)
    .map((angle) => ({
      id: `winner-${angle.angle}`,
      signal: "winner" as const,
      title: angle.angle,
      insight: `${angle.summary} Dieser Angle liegt aktuell ueber dem Account-Schnitt und hat belastbare Performance-Signale.`,
      recommendation: `Neue Varianten mit anderem Opening testen: gleicher Angle, aber neuer Hook, anderes Format oder staerkerer Proof.`,
      score: angle.score,
      confidence: confidenceFromSupport({ count: angle.creativeCount, spend: angle.spend, impressions: angle.impressions, analyzed: angle.creativeCount }),
      evidence: evidenceForAngle(angle),
      exampleCreatives: angle.exampleCreatives
    }));
}

function buildLoserPatterns(angles: AngleInsight[]) {
  return angles
    .filter((angle) => angle.creativeCount >= 1 && angle.spend > 0 && angle.score < 50)
    .sort((a, b) => a.score - b.score || b.spend - a.spend)
    .slice(0, 5)
    .map((angle) => ({
      id: `loser-${angle.angle}`,
      signal: "loser" as const,
      title: angle.angle,
      insight: `${angle.summary} Die bisherigen Creatives zeigen schwache Performance im Vergleich zu anderen Angles.`,
      recommendation: `Nicht einfach weiter skalieren. Entweder Hook radikal staerken, Offer/Proof ergaenzen oder Angle fuer diesen Funnel vorerst pausieren.`,
      score: angle.score,
      confidence: confidenceFromSupport({ count: angle.creativeCount, spend: angle.spend, impressions: angle.impressions, analyzed: angle.creativeCount }),
      evidence: evidenceForAngle(angle),
      exampleCreatives: angle.exampleCreatives
    }));
}

function buildFatigueWarnings(allAngles: AngleInsight[], recentAngles: AngleInsight[]): LearningPattern[] {
  const recentByAngle = new Map(recentAngles.map((angle) => [angle.angle, angle]));
  return allAngles
    .flatMap((angle): LearningPattern[] => {
      const recent = recentByAngle.get(angle.angle);
      if (!recent || angle.score < 65 || recent.spend < 50) return [];
      const drop = angle.score - recent.score;
      if (drop < 12) return [];
      return [{
        id: `fatigue-${angle.angle}`,
        signal: "fatigue" as const,
        title: angle.angle,
        insight: `Historisch stark, aber in den letzten 30 Tagen faellt der Score um ${drop} Punkte.`,
        recommendation: `Nicht den Angle komplett verwerfen. Neue Hook-Struktur, neues Visual Pattern und frisches Opening testen, bevor Budget weiter erhoeht wird.`,
        score: recent.score,
        confidence: confidenceFromSupport({ count: recent.creativeCount, spend: recent.spend, impressions: recent.impressions, analyzed: recent.creativeCount }),
        evidence: [`Historisch Score ${angle.score}`, `30T Score ${recent.score}`, ...evidenceForAngle(recent)],
        exampleCreatives: recent.exampleCreatives
      }];
    })
    .slice(0, 5);
}

function buildOpportunities(allAngles: AngleInsight[], recentAngles: AngleInsight[]) {
  const recentSet = new Set(recentAngles.filter((angle) => angle.spend > 0).map((angle) => angle.angle));
  return allAngles
    .filter((angle) => angle.score >= 58 && angle.spend > 0 && !recentSet.has(angle.angle))
    .slice(0, 5)
    .map((angle) => ({
      id: `opportunity-${angle.angle}`,
      signal: "opportunity" as const,
      title: angle.angle,
      insight: `Historisch positives Signal, aber aktuell wenig oder keine Ausspielung in den letzten 30 Tagen.`,
      recommendation: `Als neue Testzelle reaktivieren: 2 Hook-Varianten, 1 Static und 1 Reel, mit klarem KPI-Lernziel.`,
      score: angle.score,
      confidence: confidenceFromSupport({ count: angle.creativeCount, spend: angle.spend, impressions: angle.impressions, analyzed: angle.creativeCount }),
      evidence: evidenceForAngle(angle),
      exampleCreatives: angle.exampleCreatives
    }));
}

function hookVariantsForAngle(angle: string) {
  const normalized = angle.toLowerCase();
  if (normalized.includes("founder") || normalized.includes("story")) {
    return [
      "Was wir heute noch genauso machen wie vor 100 Jahren",
      "Warum echter Geschmack nicht schneller produziert werden kann"
    ];
  }
  if (normalized.includes("social proof") || normalized.includes("ugc")) {
    return [
      "Warum Kunden diesen Speck immer wieder bestellen",
      "Der Geschmack, den unsere Kunden sofort wiedererkennen"
    ];
  }
  if (normalized.includes("feature") || normalized.includes("usp")) {
    return [
      "Woran du echten Suedtiroler Speck sofort erkennst",
      "Dieses Detail macht den Unterschied im Geschmack"
    ];
  }
  if (normalized.includes("pain") || normalized.includes("problem")) {
    return [
      "Warum Supermarkt-Speck oft flach schmeckt",
      "Wenn Speck nach Rauch schmeckt, aber nicht nach Handwerk"
    ];
  }
  if (normalized.includes("education") || normalized.includes("myth")) {
    return [
      "Drei Dinge, die guten Speck von durchschnittlichem Speck trennen",
      "Was Reifung beim Speck wirklich veraendert"
    ];
  }
  if (normalized.includes("aspiration") || normalized.includes("lifestyle")) {
    return [
      "Der Moment, in dem aus einer Jause ein Genussmoment wird",
      "Ein Stueck Suedtirol fuer den Tisch zuhause"
    ];
  }
  if (normalized.includes("scarcity") || normalized.includes("urgency")) {
    return [
      "Nur solange dieser Reifegrad verfuegbar ist",
      "Wenn diese Charge weg ist, kommt sie so nicht wieder"
    ];
  }

  return [
    `Warum ${angle.toLowerCase()} jetzt einen neuen Test verdient`,
    `Der unterschätzte Grund hinter ${angle.toLowerCase()}`
  ];
}

function buildHookOpportunities(winners: LearningPattern[], hooks: HookInsight[]) {
  return winners.slice(0, 6).flatMap((pattern, index) => {
    const supportHook = hooks[index % Math.max(hooks.length, 1)];
    const baseScore = pattern.score;
    const [primaryHook, secondaryHook] = hookVariantsForAngle(pattern.title);
    const preferredFormat = supportHook?.formats[0] ?? "reel";
    return [
      {
        id: `hook-opportunity-${pattern.id}-1`,
        hook: primaryHook,
        angle: pattern.title,
        format: preferredFormat,
        predictedScore: clamp(baseScore + 4),
        confidence: pattern.confidence,
        why: `Neuer Hook fuer einen bestehenden Winner-Angle. Nutzt das Performance-Signal, kopiert aber keinen bestehenden Hook- oder Analyse-Text.`,
        sourcePattern: pattern.title
      },
      {
        id: `hook-opportunity-${pattern.id}-2`,
        hook: secondaryHook,
        angle: pattern.title,
        format: "static",
        predictedScore: clamp(baseScore - 2),
        confidence: clamp(pattern.confidence - 8),
        why: `Alternative Testzelle fuer denselben Angle mit anderer Einstiegsspannung und klarerem Produkt-/Proof-Bezug.`,
        sourcePattern: pattern.title
      }
    ];
  }).slice(0, 8);
}

function predictionBand(value: number | null, better: "high" | "low") {
  if (value === null) return "zu wenig Daten";
  const low = better === "high" ? value * 0.8 : value * 1.2;
  const high = better === "high" ? value * 1.25 : value * 0.85;
  return `${Math.min(low, high).toFixed(2)}-${Math.max(low, high).toFixed(2)}`;
}

function predictIdea(idea: AdIdea, angles: AngleInsight[], hooks: HookInsight[], avgScore: number): IdeaPrediction {
  const angle = angles.find((item) => item.angle === idea.angle) ?? angles
    .map((item) => ({ item, score: similarity(item.angle, idea.angle ?? idea.hook) }))
    .sort((a, b) => b.score - a.score)[0]?.item;
  const hook = hooks
    .map((item) => ({ item, score: Math.max(similarity(item.hook, idea.hook), similarity(item.hook, idea.primaryText), similarity(item.hook, idea.headline)) }))
    .sort((a, b) => b.score - a.score || b.item.avgScore - a.item.avgScore)[0];

  const angleScore = angle ? angle.score : avgScore;
  const hookScore = hook && hook.score > 0.12 ? hook.item.avgScore : avgScore;
  const ideaScore = idea.score ?? avgScore;
  const score = clamp(angleScore * 0.45 + hookScore * 0.35 + ideaScore * 0.2);
  const confidence = clamp(
    20 +
    (angle ? Math.min(angle.creativeCount, 10) * 4 : 0) +
    (hook && hook.score > 0.12 ? Math.min(hook.item.creativeCount, 8) * 4 : 0) +
    (angle ? Math.min(angle.spend / 300, 10) * 2 : 0)
  );
  const risks = [];
  if (!angle) risks.push("Kein klarer historischer Angle-Match.");
  if (!hook || hook.score <= 0.12) risks.push("Hook ist nicht stark mit bestehenden Gewinner-Hooks verbunden.");
  if (angle && angle.creativeCount < 3) risks.push("Prediction basiert auf kleiner Creative-Stichprobe.");
  if (idea.format && hook?.item.formats.length && !hook.item.formats.includes(idea.format)) risks.push("Format passt nicht eindeutig zu den bisherigen Hook-Winnern.");

  return {
    idea,
    predictedScore: score,
    confidence,
    predictedCtr: predictionBand(angle?.ctr ?? hook?.item.ctr ?? null, "high"),
    predictedCpa: predictionBand(null, "low"),
    rationale: [
      angle ? `Angle-Match: ${angle.angle} mit Score ${angle.score}.` : `Fallback auf Account-Schnitt ${avgScore}.`,
      hook && hook.score > 0.12 ? `Aehnlicher Hook: "${hook.item.hook}" mit Score ${hook.item.avgScore}.` : "Kein starker Hook-Zwilling gefunden.",
      idea.score !== null ? `AI-Ideen-Score ${idea.score} fliesst als Konzeptqualitaet ein.` : "Kein gespeicherter Ideen-Score vorhanden."
    ],
    risks: risks.length > 0 ? risks : ["Keine groben Risiken erkannt; trotzdem als kontrollierten Test launchen."]
  };
}

export async function getCreativeLearningOverview(clientId: string): Promise<CreativeLearningOverview> {
  try {
    const [{ creatives, error: creativesError }, allAngles, recentAngles, ideas] = await Promise.all([
      listClientCreatives(clientId),
      getCreativeAnglesOverview(clientId),
      getCreativeAnglesOverview(clientId, { since: todayMinus(30) }),
      getAdIdeasOverview(clientId)
    ]);

    const error = creativesError ?? allAngles.error ?? recentAngles.error ?? ideas.error;
    if (error) throw new Error(error);

    const avgCreativeScore = creatives.length > 0 ? Math.round(creatives.reduce((sum, creative) => sum + creative.performanceScore.score, 0) / creatives.length) : 0;
    const learningConfidence = confidenceFromSupport({
      count: creatives.length,
      spend: creatives.reduce((sum, creative) => sum + creative.metrics.spend, 0),
      impressions: creatives.reduce((sum, creative) => sum + creative.metrics.impressions, 0),
      analyzed: creatives.filter((creative) => creative.hasAiAnalysis).length
    });
    const winnerPatterns = buildWinnerPatterns(allAngles.angles);
    const loserPatterns = buildLoserPatterns(allAngles.angles);
    const fatigueWarnings = buildFatigueWarnings(allAngles.angles, recentAngles.angles);
    const opportunities = buildOpportunities(allAngles.angles, recentAngles.angles);
    const hookOpportunities = buildHookOpportunities(winnerPatterns, ideas.hookInsights);
    const predictions = ideas.ideas
      .map((idea) => predictIdea(idea, allAngles.angles, ideas.hookInsights, avgCreativeScore))
      .sort((a, b) => b.predictedScore - a.predictedScore || b.confidence - a.confidence);

    return {
      totals: {
        creatives: creatives.length,
        analyzedCreatives: creatives.filter((creative: CreativeListItem) => creative.hasAiAnalysis).length,
        angles: allAngles.angles.length,
        ideas: ideas.ideas.length,
        avgCreativeScore,
        learningConfidence
      },
      winnerPatterns,
      loserPatterns,
      opportunities,
      fatigueWarnings,
      hookOpportunities,
      predictions,
      error: null
    };
  } catch (error) {
    return {
      totals: { creatives: 0, analyzedCreatives: 0, angles: 0, ideas: 0, avgCreativeScore: 0, learningConfidence: 0 },
      winnerPatterns: [],
      loserPatterns: [],
      opportunities: [],
      fatigueWarnings: [],
      hookOpportunities: [],
      predictions: [],
      error: error instanceof Error ? error.message : "Learning System konnte nicht geladen werden."
    };
  }
}
