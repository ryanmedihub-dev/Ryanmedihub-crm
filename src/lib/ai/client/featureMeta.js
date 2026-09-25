// Client-side metadata about a feature key that useAiInsight/useAiVerdicts
// need before they know anything else about it. Today that's just which
// features are backed by a source route slow enough (maxDuration 300, e.g.
// campaign-performance) to need the "-long" SSE/verdicts route instead of the
// normal 60s one — see src/app/api/owner/ai/insight-long and
// src/lib/ai/sseHandler.js for why that has to be a separate route file.
export const AI_FEATURE_META = {
  "marketing.performance": { long: true },
  "marketing.campaignLeads": { long: true },
};

export function isLongFeature(feature) {
  return !!AI_FEATURE_META[feature]?.long;
}
