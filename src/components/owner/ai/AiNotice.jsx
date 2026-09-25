"use client";

import Link from "next/link";

// The one place every honest "AI isn't showing you anything right now" copy
// lives — every status string an AI panel can be in maps to exactly one of
// these, so no panel ever invents its own wording.
const COPY = {
  disabled: "AI analysis is switched off for this workspace.",
  unconfigured: "AI isn't configured yet — the OpenAI key is missing on the server.",
  budget_exceeded: "AI paused — this month's AI budget is used up. Data below is live; analysis resumes on the 1st or when the budget is raised.",
  rate_limited: "Too many analyses in a short time. Try again in a few minutes.",
  pii_blocked: "AI analysis was blocked by the privacy guard before anything was sent. This has been logged.",
  schema_invalid: "AI returned something unexpected and couldn't be shown. Your data below is unaffected.",
  timeout: "AI took too long to respond. Your data below is unaffected.",
  error: "AI analysis failed. Your data below is unaffected.",
};

export default function AiNotice({ status, message, onRetry }) {
  const base = COPY[status] || COPY.error;
  const text = status === "error" && message ? `AI analysis failed: ${message}. Your data below is unaffected.` : base;
  const retryable = ["error", "timeout", "schema_invalid", "rate_limited"].includes(status);

  return (
    <div className={`ai-notice ai-notice-${status}`} role="status">
      <span className="ai-notice-dot" aria-hidden="true" />
      <p>{text}</p>
      {status === "budget_exceeded" && (
        <Link href="/owner/ai/health" className="ai-notice-link">View AI budget →</Link>
      )}
      {retryable && onRetry && (
        <button type="button" className="ai-notice-retry" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}
