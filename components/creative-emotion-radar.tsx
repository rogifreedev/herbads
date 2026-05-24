import type { CreativeEmotionScores } from "@/lib/creative-ai";

type EmotionKey = keyof CreativeEmotionScores;

const emotions: Array<{ key: EmotionKey; label: string; shortLabel: string }> = [
  { key: "curiosity", label: "Neugier", shortLabel: "Neugier" },
  { key: "desire", label: "Verlangen", shortLabel: "Desire" },
  { key: "trust", label: "Vertrauen", shortLabel: "Trust" },
  { key: "urgency", label: "Dringlichkeit", shortLabel: "Urgency" },
  { key: "joy", label: "Freude", shortLabel: "Joy" },
  { key: "fearOfMissingOut", label: "FOMO", shortLabel: "FOMO" }
];

function scoreValue(scores: CreativeEmotionScores, key: EmotionKey) {
  return scores[key] ?? 0;
}

function polarPoint(center: number, radius: number, index: number, total: number, value = 1) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const scaledRadius = radius * value;

  return {
    x: center + Math.cos(angle) * scaledRadius,
    y: center + Math.sin(angle) * scaledRadius
  };
}

export function hasEmotionScores(scores: CreativeEmotionScores) {
  return emotions.some((emotion) => scores[emotion.key] !== null);
}

export function CreativeEmotionRadar({ scores }: { scores: CreativeEmotionScores }) {
  const size = 320;
  const center = size / 2;
  const radius = 104;
  const total = emotions.length;
  const valuePoints = emotions
    .map((emotion, index) => {
      const point = polarPoint(center, radius, index, total, scoreValue(scores, emotion.key) / 100);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <div className="rounded-xl border border-herb-border bg-black/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="mx-auto w-full max-w-[340px]">
          <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Emotion Radar Chart" className="h-auto w-full">
            {[0.25, 0.5, 0.75, 1].map((level) => (
              <polygon
                key={level}
                points={emotions.map((_, index) => {
                  const point = polarPoint(center, radius, index, total, level);
                  return `${point.x},${point.y}`;
                }).join(" ")}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1"
              />
            ))}
            {emotions.map((emotion, index) => {
              const end = polarPoint(center, radius, index, total);
              const label = polarPoint(center, radius + 31, index, total);
              const anchor = label.x > center + 12 ? "start" : label.x < center - 12 ? "end" : "middle";

              return (
                <g key={emotion.key}>
                  <line x1={center} y1={center} x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
                  <text x={label.x} y={label.y} textAnchor={anchor} dominantBaseline="middle" className="fill-white/60 text-[11px] font-medium">
                    {emotion.shortLabel}
                  </text>
                </g>
              );
            })}
            <polygon points={valuePoints} fill="rgba(229,31,118,0.28)" stroke="#e51f76" strokeWidth="2" />
            {emotions.map((emotion, index) => {
              const point = polarPoint(center, radius, index, total, scoreValue(scores, emotion.key) / 100);
              return <circle key={emotion.key} cx={point.x} cy={point.y} r="4" fill="#e51f76" stroke="white" strokeOpacity="0.8" strokeWidth="1" />;
            })}
          </svg>
        </div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          {emotions.map((emotion) => (
            <div key={emotion.key} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-xs text-white/45">{emotion.label}</p>
              <p className="mt-1 font-heading text-2xl text-white">{scoreValue(scores, emotion.key)}/100</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
