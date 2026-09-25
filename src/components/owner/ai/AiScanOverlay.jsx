"use client";

// Relative wrapper that adds a sweeping light bar + faint shimmer tint while
// `active`, with no layout change to the children underneath.
export default function AiScanOverlay({ active = false, children }) {
  return (
    <div className={`ai-scan-overlay${active ? " ai-scan-active" : ""}`} aria-busy={active || undefined}>
      {active && <span className="ai-scan-bar" aria-hidden="true" />}
      {children}
    </div>
  );
}
