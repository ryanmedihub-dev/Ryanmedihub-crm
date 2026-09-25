"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import AiOrb from "./AiOrb";
import AiPipeline from "./AiPipeline";
import AiStreamText from "./AiStreamText";
import AiScoreRing from "./AiScoreRing";
import AiScanOverlay from "./AiScanOverlay";
import AiFactsDrawer from "./AiFactsDrawer";
import AiNotice from "./AiNotice";
import { relativeTime, SEVERITY_TONE, DIRECTION_ARROW } from "@/lib/ai/client/aiLabels";

const FAILED_STATUSES = ["disabled", "unconfigured", "budget_exceeded", "rate_limited", "error", "pii_blocked", "schema_invalid", "timeout"];
const PAUSED_STATUSES = ["disabled", "unconfigured", "budget_exceeded", "rate_limited"];
const CONFIDENCE_BARS = { low: 1, medium: 2, high: 3 };

function orbState(status, stages) {
  if (status === "running") return stages?.analyze ? "speaking" : "thinking";
  if (status === "ready") return "done";
  if (FAILED_STATUSES.includes(status)) return PAUSED_STATUSES.includes(status) ? "paused" : "error";
  return "idle";
}

// The star component — placed at the top of every owner page. Every string
// and number it shows comes from a real engine run (see useAiInsight); there
// is no simulated state anywhere in here.
export default function AiBriefPanel({ feature, scope, title, enabled = true, compact = false, variant = "default", aiState = null, scoreLabel = "AI health score" }) {
  const hero = variant === "hero";
  // A page that also needs this same brief for its topbar (OwnerTopbar's
  // `aiState` prop) can call useAiInsight itself and pass the result down
  // here instead — this hook still runs (Rules of Hooks) but does nothing
  // when `aiState` is supplied, so there is never a second stream.
  const ownAi = useAiInsight(feature, scope, { kind: "brief", enabled: enabled && !aiState });
  const ai = aiState || ownAi;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const [pulseKey, setPulseKey] = useState(0);
  const partialLenRef = useRef(0);

  useEffect(() => {
    const len = (ai.partial.headline || "").length + (ai.partial.summary || "").length;
    if (len !== partialLenRef.current) {
      partialLenRef.current = len;
      setPulseKey((k) => k + 1);
    }
  }, [ai.partial.headline, ai.partial.summary]);

  if (!enabled) return null;

  const running = ai.status === "running";
  const ready = ai.status === "ready";
  const failed = FAILED_STATUSES.includes(ai.status);
  const orb = orbState(ai.status, ai.stages);

  const headline = ready ? ai.result?.headline : ai.partial.headline;
  const summary = ready ? ai.result?.summary : ai.partial.summary;
  const statusText = running
    ? "Analyzing…"
    : ready
      ? ai.cached
        ? `Analyzed ${relativeTime(ai.generatedAt)} · data unchanged`
        : "Analyzed just now"
      : "";

  if (compact && !expanded) {
    return (
      <button type="button" className="ai-brief-panel ai-brief-compact" onClick={() => setExpanded(true)}>
        <AiOrb state={orb} size={28} pulseKey={pulseKey} />
        <span className="ai-brief-compact-headline">{failed ? "AI analysis unavailable" : headline || "Analyzing…"}</span>
        {ready && ai.result?.healthScore != null && <span className="ai-brief-compact-score">{ai.result.healthScore}</span>}
        <span className="ai-brief-compact-chevron" aria-hidden="true">▾</span>
      </button>
    );
  }

  return (
    <m.section
      className={`ai-brief-panel${hero ? " ai-brief-hero" : ""}${ai.stale ? " ai-brief-stale" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <header className="ai-brief-header">
        <div className="ai-brief-header-left">
          <AiOrb state={orb} size={hero ? 88 : 40} pulseKey={pulseKey} />
          <div>
            <div className="ai-brief-eyebrow">AI Analysis · {title}</div>
            {!failed && <div className="ai-brief-status">{statusText}</div>}
          </div>
        </div>
        <div className="ai-brief-header-right">
          {ai.meta?.model && <span className="ai-model-chip">{ai.meta.model}</span>}
          <button type="button" className="ai-ghost-btn" onClick={ai.refresh} disabled={running}>↻ Re-analyze</button>
          <button type="button" className="ai-ghost-btn" onClick={() => setDrawerOpen(true)} disabled={!ai.facts}>What AI saw</button>
          {compact && <button type="button" className="ai-ghost-btn" onClick={() => setExpanded(false)} aria-label="Collapse">▴</button>}
        </div>
      </header>

      {failed && !ai.stale && <AiNotice status={ai.status} message={ai.error} onRetry={ai.refresh} />}
      {ai.stale && (
        <div className="ai-brief-stale-banner">
          ⏸ AI paused ({ai.status === "budget_exceeded" ? "monthly budget reached" : ai.status.replace(/_/g, " ")}) — showing the last result, from {relativeTime(ai.generatedAt)}.
        </div>
      )}

      {(running || ready) && (
        <AiScanOverlay active={running}>
          {running && <AiPipeline stages={ai.stages} />}

          <div className="ai-brief-body">
            <div className="ai-brief-col-main">
              <AiStreamText as="h3" className={`ai-brief-headline${hero ? " ai-brief-headline-hero" : ""}`} text={headline || ""} streaming={running} />
              <AiStreamText as="p" className="ai-brief-summary" text={summary || ""} streaming={running} />

              {ready && ai.result?.signals?.length > 0 && (
                <div className="ai-signal-row">
                  {ai.result.signals.map((s, i) => (
                    <span key={i} className={`ai-signal ai-signal-${SEVERITY_TONE[s.severity] || "info"}`}>
                      {DIRECTION_ARROW[s.direction]} {s.label} <b>{s.value}</b>
                    </span>
                  ))}
                </div>
              )}

              {ready && ai.result?.insights?.length > 0 && (
                <div className="ai-insight-list">
                  {ai.result.insights.map((ins, i) => (
                    <m.div
                      key={i}
                      className={`ai-insight-card ai-insight-${SEVERITY_TONE[ins.severity] || "info"}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                    >
                      <div className="ai-insight-title">{ins.title}</div>
                      <div className="ai-insight-detail">{ins.detail}</div>
                    </m.div>
                  ))}
                </div>
              )}
            </div>

            <div className="ai-brief-col-side">
              {ready && ai.result?.healthScore != null && (
                <AiScoreRing value={ai.result.healthScore} sentiment={ai.result.sentiment} size={hero ? 120 : 96} label={scoreLabel} />
              )}
              {ready && ai.result?.confidence && (
                <div className="ai-confidence" title={ai.result.confidenceReason}>
                  <div className="ai-confidence-bars">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={`ai-confidence-bar${i < (CONFIDENCE_BARS[ai.result.confidence] || 0) ? " ai-confidence-lit" : ""}`} />
                    ))}
                  </div>
                  <span className="ai-confidence-label">{ai.result.confidence} confidence</span>
                </div>
              )}
              {!hero && ready && ai.result?.actions?.length > 0 && (
                <ul className="ai-action-list">
                  {ai.result.actions.map((a, i) => (
                    <li key={i} className={`ai-action ai-action-${a.priority}`}>
                      <div className="ai-action-title">{a.title}</div>
                      <div className="ai-action-detail">{a.detail}</div>
                      {a.link && <a href={a.link} className="ai-action-link">Open →</a>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {hero && ready && ai.result?.actions?.length > 0 && (
            <div className="ai-priorities-row">
              {ai.result.actions.slice(0, 3).map((a, i) => (
                <m.div
                  key={i}
                  className={`ai-priority-card ai-action-${a.priority}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <span className="ai-priority-label">AI Priority</span>
                  <div className="ai-action-title">{a.title}</div>
                  <div className="ai-action-detail">{a.detail}</div>
                  {a.link && <a href={a.link} className="ai-action-link">Open →</a>}
                </m.div>
              ))}
            </div>
          )}
        </AiScanOverlay>
      )}

      {ready && (
        <footer className="ai-brief-footer">
          <span className={`ai-grounding ai-grounding-${ai.grounding?.grounded ? "ok" : "warn"}`}>
            {ai.grounding?.grounded ? "✓ All figures verified against data" : `⚠ ${ai.grounding?.ungrounded?.length || 0} figure(s) couldn't be verified`}
          </span>
          {ai.result?.dataGaps?.length > 0 && <span className="ai-data-gaps">{ai.result.dataGaps.join(" · ")}</span>}
          <span className="ai-feedback">
            <button type="button" onClick={() => ai.vote("up")} aria-label="Helpful">👍</button>
            <button type="button" onClick={() => ai.vote("down")} aria-label="Not helpful">👎</button>
          </span>
          {ai.meta && (
            <span className="ai-usage-meta">
              {(ai.meta.promptTokens || 0) + (ai.meta.completionTokens || 0)} tok · {ai.meta.latencyMs}ms · ${(ai.meta.costUsd || 0).toFixed(4)}
            </span>
          )}
        </footer>
      )}

      <AiFactsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} facts={ai.facts} entities={ai.entities} meta={ai.meta} />
    </m.section>
  );
}
