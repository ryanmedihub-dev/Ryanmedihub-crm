"use client";

import { useState } from "react";
import { VERDICT_LABEL_SETS, VERDICT_TONE } from "@/lib/ai/client/aiLabels";
import AiOrb from "./AiOrb";

export default function AiVerdictChip({ verdict, score, oneLiner, tags, loading = false, labelSet = "performance" }) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <span className="ai-verdict-chip ai-verdict-loading">
        <AiOrb state="thinking" size={12} />
        <span className="ai-verdict-shimmer" />
      </span>
    );
  }
  if (!verdict) return <span className="ai-verdict-chip ai-verdict-empty">—</span>;

  const tone = VERDICT_TONE[verdict] || "neutral";
  const label = (VERDICT_LABEL_SETS[labelSet] || VERDICT_LABEL_SETS.performance)[verdict] || verdict;

  return (
    <span
      className={`ai-verdict-chip ai-verdict-${tone}`}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="ai-verdict-dot" aria-hidden="true" />
      {label}
      {Number.isFinite(score) && <span className="ai-verdict-score">{score}</span>}
      {open && (oneLiner || tags?.length > 0) && (
        <span className="ai-verdict-tooltip" role="tooltip">
          {oneLiner && <span className="ai-verdict-tooltip-line">{oneLiner}</span>}
          {tags?.length > 0 && (
            <span className="ai-verdict-tags">
              {tags.map((t) => <span key={t} className="ai-verdict-tag">{t}</span>)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
