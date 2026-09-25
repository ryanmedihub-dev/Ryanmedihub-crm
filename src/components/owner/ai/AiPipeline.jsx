"use client";

// Horizontal stepper driven entirely by `stages` from useAiInsight — every
// node shows only what the engine actually reported (state + real ms), never
// a simulated progress value.
const STEPS = [
  { key: "collect", label: "Collect data" },
  { key: "compute", label: "Compute metrics" },
  { key: "analyze", label: "AI analysis" },
  { key: "verify", label: "Verify" },
];

function stepStatus(stages, key, index) {
  const stage = stages?.[key];
  if (stage?.state === "done") return "done";
  if (stage?.state === "start") return "active";
  // A step is implicitly "done" once a later step has started, even if this
  // one's own "done" event raced the render (deltas can arrive fast).
  const later = STEPS.slice(index + 1).some((s) => stages?.[s.key]);
  return later ? "done" : "pending";
}

export default function AiPipeline({ stages, compact = false }) {
  if (compact) {
    return (
      <div className="ai-pipeline ai-pipeline-compact" aria-label="AI analysis progress">
        {STEPS.map((s, i) => {
          const status = stepStatus(stages, s.key, i);
          const ms = stages?.[s.key]?.ms;
          return (
            <span key={s.key} className={`ai-pipeline-dot ai-pipeline-${status}`} title={ms ? `${s.label} · ${ms}ms` : s.label} />
          );
        })}
      </div>
    );
  }

  return (
    <div className="ai-pipeline" aria-label="AI analysis progress">
      {STEPS.map((s, i) => {
        const status = stepStatus(stages, s.key, i);
        const ms = stages?.[s.key]?.ms;
        return (
          <div key={s.key} className={`ai-pipeline-node ai-pipeline-${status}`}>
            {i > 0 && <span className={`ai-pipeline-connector${status !== "pending" ? " ai-pipeline-connector-lit" : ""}`} aria-hidden="true" />}
            <span className="ai-pipeline-dot" aria-hidden="true" />
            <span className="ai-pipeline-label">{s.label}</span>
            <span className="ai-pipeline-ms">{ms != null ? `${ms}ms` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
