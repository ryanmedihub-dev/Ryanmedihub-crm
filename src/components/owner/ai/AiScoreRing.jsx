"use client";

import CountUp from "./CountUp";
import { SENTIMENT_TONE } from "@/lib/ai/client/aiLabels";

const CIRCUMFERENCE = 2 * Math.PI * 42; // r=42

const TONE_STOP = { good: "var(--pos)", info: "var(--info)", warn: "var(--warn)", bad: "var(--crit)" };

export default function AiScoreRing({ value, sentiment = "neutral", size = 96, label = "AI health score" }) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  const offset = CIRCUMFERENCE * (1 - score / 100);
  const tone = SENTIMENT_TONE[sentiment] || "info";
  const stroke = TONE_STOP[tone];

  return (
    <div className="ai-score-ring" style={{ "--ai-ring-size": `${size}px` }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r="42" className="ai-score-ring-track" />
        <circle
          cx="50" cy="50" r="42"
          className="ai-score-ring-value"
          style={{ stroke, strokeDasharray: CIRCUMFERENCE, strokeDashoffset: offset }}
        />
      </svg>
      <div className="ai-score-ring-center">
        <CountUp value={score} format="num" />
      </div>
      <div className="ai-score-ring-label">{label}</div>
    </div>
  );
}
