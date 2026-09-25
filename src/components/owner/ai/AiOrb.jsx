"use client";

// Pure-CSS status orb — every visual state maps 1:1 to a real engine state
// (see owner-ai.css .ai-orb rules), never an arbitrary decorative loop.
// idle: breathing. thinking (collect/compute): spinning ring + orbiting dots.
// speaking (analyze): core pulses once per delta via `pulseKey`. done: single
// ripple. error/paused: desaturated, no motion.
export default function AiOrb({ state = "idle", size = 56, pulseKey = 0 }) {
  return (
    <span
      className={`ai-orb ai-orb-${state}`}
      style={{ "--ai-orb-size": `${size}px` }}
      role="img"
      aria-label={`AI ${state}`}
    >
      <span className="ai-orb-ring" aria-hidden="true" />
      {/* Re-keying on each delta remounts the core, restarting its one-shot pulse animation. */}
      <span key={state === "speaking" ? pulseKey : "core"} className="ai-orb-core" aria-hidden="true" />
      {state === "thinking" && (
        <span className="ai-orb-particles" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      )}
    </span>
  );
}
