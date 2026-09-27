

const str = (maxLength) => ({ type: "string", maxLength });
const enumOf = (values) => ({ type: "string", enum: values });

const signal = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value", "direction", "severity"],
  properties: {
    label: str(40),
    value: str(40),
    direction: enumOf(["up", "down", "flat"]),
    severity: enumOf(["good", "info", "warn", "crit"]),
  },
};

const insight = {
  type: "object",
  additionalProperties: false,
  required: ["title", "detail", "severity", "entities"],
  properties: {
    title: str(80),
    detail: str(280),
    severity: enumOf(["good", "info", "warn", "crit"]),
    entities: { type: "array", maxItems: 5, items: str(8) },
  },
};

const action = {
  type: "object",
  additionalProperties: false,
  required: ["title", "detail", "priority", "link"],
  properties: {
    title: str(80),
    detail: str(220),
    priority: enumOf(["high", "medium", "low"]),
    link: str(200),
  },
};

const briefSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline", "summary", "healthScore", "sentiment", "signals", "insights",
    "actions", "dataGaps", "confidence", "confidenceReason",
  ],
  properties: {
    headline: str(120),
    summary: str(600),
    healthScore: { type: "integer", minimum: 0, maximum: 100 },
    sentiment: enumOf(["positive", "neutral", "concerning", "critical"]),
    signals: { type: "array", maxItems: 6, items: signal },
    insights: { type: "array", maxItems: 5, items: insight },
    actions: { type: "array", maxItems: 4, items: action },
    dataGaps: { type: "array", maxItems: 3, items: str(160) },
    confidence: enumOf(["high", "medium", "low"]),
    confidenceReason: str(160),
  },
};

const verdictRow = {
  type: "object",
  additionalProperties: false,
  required: ["alias", "verdict", "score", "oneLiner", "tags"],
  properties: {
    alias: str(8),
    verdict: enumOf(["star", "solid", "watch", "at_risk", "insufficient_data"]),
    score: { type: "integer", minimum: 0, maximum: 100 },
    oneLiner: str(90),
    tags: { type: "array", maxItems: 3, items: str(24) },
  },
};

const verdictsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rows", "cohortNote"],
  properties: {
    rows: { type: "array", maxItems: 60, items: verdictRow },
    cohortNote: str(200),
  },
};

const strengthOrConcern = (withSeverity) => ({
  type: "object",
  additionalProperties: false,
  required: withSeverity ? ["title", "detail", "severity"] : ["title", "detail"],
  properties: {
    title: str(80),
    detail: str(240),
    ...(withSeverity ? { severity: enumOf(["good", "info", "warn", "crit"]) } : {}),
  },
});

const planStep = {
  type: "object",
  additionalProperties: false,
  required: ["step", "why", "horizon"],
  properties: {
    step: str(100),
    why: str(200),
    horizon: enumOf(["today", "this_week", "this_month"]),
  },
};

const deepSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline", "summary", "healthScore", "sentiment", "strengths", "concerns",
    "plan", "peerComparison", "outlook", "dataGaps", "confidence", "confidenceReason",
  ],
  properties: {
    headline: str(120),
    summary: str(700),
    healthScore: { type: "integer", minimum: 0, maximum: 100 },
    sentiment: enumOf(["positive", "neutral", "concerning", "critical"]),
    strengths: { type: "array", maxItems: 4, items: strengthOrConcern(false) },
    concerns: { type: "array", maxItems: 4, items: strengthOrConcern(true) },
    plan: { type: "array", maxItems: 5, items: planStep },
    peerComparison: str(300),
    outlook: {
      type: "object",
      additionalProperties: false,
      required: ["text", "direction"],
      properties: {
        text: str(240),
        direction: enumOf(["improving", "stable", "declining", "unclear"]),
      },
    },
    dataGaps: { type: "array", maxItems: 3, items: str(160) },
    confidence: enumOf(["high", "medium", "low"]),
    confidenceReason: str(160),
  },
};

export const SCHEMAS = { brief: briefSchema, verdicts: verdictsSchema, deep: deepSchema };

function truncStr(v, max, fallback = "") {
  return typeof v === "string" ? v.slice(0, max) : fallback;
}
function clampInt(v, min, max, fallback) {
  const n = Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}
function oneOf(v, options, fallback) {
  return options.includes(v) ? v : fallback;
}
function arr(v, max, mapItem) {
  return (Array.isArray(v) ? v.slice(0, max) : []).map(mapItem).filter(Boolean);
}

function cleanSignal(s) {
  if (!s || typeof s !== "object") return null;
  return {
    label: truncStr(s.label, 40),
    value: truncStr(s.value, 40),
    direction: oneOf(s.direction, ["up", "down", "flat"], "flat"),
    severity: oneOf(s.severity, ["good", "info", "warn", "crit"], "info"),
  };
}
function cleanInsight(i) {
  if (!i || typeof i !== "object") return null;
  return {
    title: truncStr(i.title, 80),
    detail: truncStr(i.detail, 280),
    severity: oneOf(i.severity, ["good", "info", "warn", "crit"], "info"),
    entities: arr(i.entities, 5, (e) => truncStr(e, 8)),
  };
}
function cleanAction(a) {
  if (!a || typeof a !== "object") return null;
  return {
    title: truncStr(a.title, 80),
    detail: truncStr(a.detail, 220),
    priority: oneOf(a.priority, ["high", "medium", "low"], "medium"),
    link: truncStr(a.link, 200),
  };
}

function validateBrief(o) {
  return {
    headline: truncStr(o.headline, 120),
    summary: truncStr(o.summary, 600),
    healthScore: clampInt(o.healthScore, 0, 100, 50),
    sentiment: oneOf(o.sentiment, ["positive", "neutral", "concerning", "critical"], "neutral"),
    signals: arr(o.signals, 6, cleanSignal),
    insights: arr(o.insights, 5, cleanInsight),
    actions: arr(o.actions, 4, cleanAction),
    dataGaps: arr(o.dataGaps, 3, (g) => truncStr(g, 160)),
    confidence: oneOf(o.confidence, ["high", "medium", "low"], "medium"),
    confidenceReason: truncStr(o.confidenceReason, 160),
  };
}

function cleanVerdictRow(r) {
  if (!r || typeof r !== "object" || !r.alias) return null;
  return {
    alias: truncStr(r.alias, 8),
    verdict: oneOf(r.verdict, ["star", "solid", "watch", "at_risk", "insufficient_data"], "insufficient_data"),
    score: clampInt(r.score, 0, 100, 0),
    oneLiner: truncStr(r.oneLiner, 90),
    tags: arr(r.tags, 3, (t) => truncStr(t, 24)),
  };
}

function validateVerdicts(o) {
  return {
    rows: arr(o.rows, 60, cleanVerdictRow),
    cohortNote: truncStr(o.cohortNote, 200),
  };
}

function cleanStrength(s, withSeverity) {
  if (!s || typeof s !== "object") return null;
  const out = { title: truncStr(s.title, 80), detail: truncStr(s.detail, 240) };
  if (withSeverity) out.severity = oneOf(s.severity, ["good", "info", "warn", "crit"], "info");
  return out;
}
function cleanPlanStep(p) {
  if (!p || typeof p !== "object") return null;
  return {
    step: truncStr(p.step, 100),
    why: truncStr(p.why, 200),
    horizon: oneOf(p.horizon, ["today", "this_week", "this_month"], "this_week"),
  };
}

function validateDeep(o) {
  return {
    headline: truncStr(o.headline, 120),
    summary: truncStr(o.summary, 700),
    healthScore: clampInt(o.healthScore, 0, 100, 50),
    sentiment: oneOf(o.sentiment, ["positive", "neutral", "concerning", "critical"], "neutral"),
    strengths: arr(o.strengths, 4, (s) => cleanStrength(s, false)),
    concerns: arr(o.concerns, 4, (s) => cleanStrength(s, true)),
    plan: arr(o.plan, 5, cleanPlanStep),
    peerComparison: truncStr(o.peerComparison, 300),
    outlook: {
      text: truncStr(o.outlook?.text, 240),
      direction: oneOf(o.outlook?.direction, ["improving", "stable", "declining", "unclear"], "unclear"),
    },
    dataGaps: arr(o.dataGaps, 3, (g) => truncStr(g, 160)),
    confidence: oneOf(o.confidence, ["high", "medium", "low"], "medium"),
    confidenceReason: truncStr(o.confidenceReason, 160),
  };
}

const VALIDATORS = { brief: validateBrief, verdicts: validateVerdicts, deep: validateDeep };

export function validate(kind, obj) {
  const fn = VALIDATORS[kind];
  if (!fn) throw new Error(`validate: unknown kind "${kind}"`);
  if (!obj || typeof obj !== "object") throw new Error(`validate: ${kind} output is not an object`);
  return fn(obj);
}
