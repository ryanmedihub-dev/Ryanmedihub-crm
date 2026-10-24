"use client";

export default function AiOrb({ state = "idle", size = 56, pulseKey = 0 }) {
  return (
    <span
      className={`ai-orb ai-orb-${state}`}
      style={{ "--ai-orb-size": `${size}px` }}
      role="img"
      aria-label={`AI ${state}`}
    >
      <span className="ai-orb-ring" aria-hidden="true" />
      <span key={state === "speaking" ? pulseKey : "core"} className="ai-orb-core" aria-hidden="true" />
    </span>
  );
}
