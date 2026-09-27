"use client";

export default function AiScanOverlay({ active = false, children }) {
  return (
    <div className={`ai-scan-overlay${active ? " ai-scan-active" : ""}`} aria-busy={active || undefined}>
      {active && <span className="ai-scan-bar" aria-hidden="true" />}
      {children}
    </div>
  );
}
