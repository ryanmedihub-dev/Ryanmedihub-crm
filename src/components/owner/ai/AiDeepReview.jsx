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
const HORIZONS = [
  ["today", "Today"],
  ["this_week", "This week"],
  ["this_month", "This month"],
];

function orbState(status, stages) {
  if (status === "running") return stages?.analyze ? "speaking" : "thinking";
  if (status === "ready") return "done";
  if (FAILED_STATUSES.includes(status)) return PAUSED_STATUSES.includes(status) ? "paused" : "error";
  return "idle";
}

// Detail-page counterpart of AiBriefPanel — same pipeline/streaming/notice/
// footer behaviour, kind:"deep" instead of "brief", laid out as a timeline
// review rather than a KPI-adjacent strip.
export default function AiDeepReview({ feature, scope, title, enabled = true, aiState = null }) {
  // Same "share one stream" pattern as AiBriefPanel — a page that also wants
  // this result elsewhere (e.g. the entity header's AI ring/score) calls
  // useAiInsight itself and passes it down instead of a second stream.
  const ownAi = useAiInsight(feature, scope, { kind: "deep", enabled: enabled && !aiState });
  const ai = aiState || ownAi;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const partialLenRef = useRef(0);

  useEffect(() => {
    const len = (ai.partial.headline || "").length + (ai.partial.summary || "").length;
    if (len !== partialLenRef.current) {
      partialLenRef.current = len;
      setPulseKey((k) => k + 1);
    }
  }, [ai.partial.headline, ai.partial.summary]);

  const running = ai.status === "running";
  const ready = ai.status === "ready";
  const failed = FAILED_STATUSES.includes(ai.status);
  const orb = orbState(ai.status, ai.stages);
  const headline = ready ? ai.result?.headline : ai.partial.headline;
  const summary = ready ? ai.result?.summary : ai.partial.summary;

  const planByHorizon = HORIZONS.map(([key, label]) => [label, (ai.result?.plan || []).filter((p) => p.horizon === key)]).filter(([, items]) => items.length);

  return (
    <m.section className="ai-brief-panel ai-deep-review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
      <header className="ai-brief-header">
        <div className="ai-brief-header-left">
          <AiOrb state={orb} size={40} pulseKey={pulseKey} />
          <div>
            <div className="ai-brief-eyebrow">AI Deep Review · {title}</div>
            {!failed && <div className="ai-brief-status">{running ? "Analyzing…" : ready ? (ai.cached ? `Analyzed ${relativeTime(ai.generatedAt)} · data unchanged` : "Analyzed just now") : ""}</div>}
          </div>
        </div>
        <div className="ai-brief-header-right">
          {ai.meta?.model && <span className="ai-model-chip">{ai.meta.model}</span>}
          <button type="button" className="ai-ghost-btn" onClick={ai.refresh} disabled={running}>↻ Re-analyze</button>
          <button type="button" className="ai-ghost-btn" onClick={() => setDrawerOpen(true)} disabled={!ai.facts}>What AI saw</button>
        </div>
      </header>

      {failed && !ai.stale && <AiNotice status={ai.status} message={ai.error} onRetry={ai.refresh} />}

      {(running || ready) && (
        <AiScanOverlay active={running}>
          {running && <AiPipeline stages={ai.stages} />}

          <div className="ai-brief-body ai-deep-body">
            <div className="ai-brief-col-main">
              <AiStreamText as="h3" className="ai-brief-headline" text={headline || ""} streaming={running} />
              <AiStreamText as="p" className="ai-brief-summary" text={summary || ""} streaming={running} />

              {ready && ai.result?.strengths?.length > 0 && (
                <div className="ai-deep-section">
                  <h4 className="ai-deep-section-title ai-tone-good">Strengths</h4>
                  {ai.result.strengths.map((s, i) => (
                    <div key={i} className="ai-insight-card ai-insight-good">
                      <div className="ai-insight-title">{s.title}</div>
                      <div className="ai-insight-detail">{s.detail}</div>
                    </div>
                  ))}
                </div>
              )}

              {ready && ai.result?.concerns?.length > 0 && (
                <div className="ai-deep-section">
                  <h4 className="ai-deep-section-title ai-tone-warn">Concerns</h4>
                  {ai.result.concerns.map((c, i) => (
                    <div key={i} className={`ai-insight-card ai-insight-${SEVERITY_TONE[c.severity] || "warn"}`}>
                      <div className="ai-insight-title">{c.title}</div>
                      <div className="ai-insight-detail">{c.detail}</div>
                    </div>
                  ))}
                </div>
              )}

              {ready && planByHorizon.length > 0 && (
                <div className="ai-deep-section">
                  <h4 className="ai-deep-section-title">Plan</h4>
                  <div className="ai-plan-timeline">
                    {planByHorizon.map(([label, items]) => (
                      <div key={label} className="ai-plan-group">
                        <div className="ai-plan-horizon">{label}</div>
                        {items.map((p, i) => (
                          <div key={i} className="ai-plan-step">
                            <span className="ai-plan-dot" aria-hidden="true" />
                            <div>
                              <div className="ai-plan-step-text">{p.step}</div>
                              <div className="ai-plan-step-why">{p.why}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ready && ai.result?.peerComparison && (
                <div className="ai-deep-section">
                  <h4 className="ai-deep-section-title">Peer comparison</h4>
                  <p className="ai-brief-summary">{ai.result.peerComparison}</p>
                </div>
              )}
            </div>

            <div className="ai-brief-col-side">
              {ready && ai.result?.healthScore != null && <AiScoreRing value={ai.result.healthScore} sentiment={ai.result.sentiment} />}
              {ready && ai.result?.outlook && (
                <div className="ai-outlook">
                  <span className="ai-outlook-arrow">{DIRECTION_ARROW[ai.result.outlook.direction]}</span>
                  <span>{ai.result.outlook.text}</span>
                </div>
              )}
            </div>
          </div>
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
        </footer>
      )}

      <AiFactsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} facts={ai.facts} entities={ai.entities} meta={ai.meta} />
    </m.section>
  );
}
