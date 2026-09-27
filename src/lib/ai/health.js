import AiRun from "@/models/AiRun";
import AiInsight from "@/models/AiInsight";
import SanyaUsage from "@/models/SanyaUsage";
import { FEATURES } from "./features";
import { istDayBucket } from "@/lib/owner/dates";
import { AI_ENABLED, AI_BRIEF_MODEL, AI_DEEP_MODEL, AI_MONTHLY_BUDGET_USD, AI_DEFAULT_TTL_MIN, AI_OUTPUT_LANGUAGE } from "./config";
import { SANYA_MODEL, SANYA_MONTHLY_BUDGET_USD } from "@/lib/sanya/config";
import { cached } from "@/lib/cache";

const round1 = (n) => Math.round((n || 0) * 10) / 10;
const round2 = (n) => Math.round((n || 0) * 100) / 100;
const pct = (a, b) => (b ? round1((a / b) * 100) : 0);

function monthStart() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function daysInMonth(d = new Date()) {
  return new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getDate();
}
function daysElapsedInMonth() {
  return Math.max(1, Math.ceil((Date.now() - monthStart().getTime()) / 86400000));
}
function projectMonthEnd(mtd) {
  return round2((mtd / daysElapsedInMonth()) * daysInMonth());
}
function percentileOf(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function computeLiteHealthUncached() {
  if (!AI_ENABLED) return { status: "disabled", lastOkAt: null, p50LatencyMs: null, budgetUsedPct: 0 };
  if (!process.env.OPENAI_API_KEY) return { status: "unconfigured", lastOkAt: null, p50LatencyMs: null, budgetUsedPct: 0 };

  const [mtdAgg] = await AiRun.aggregate([
    { $match: { createdAt: { $gte: monthStart() } } },
    { $group: { _id: null, cost: { $sum: "$costUsd" } } },
  ]);
  const budgetUsedPct = pct(mtdAgg?.cost || 0, AI_MONTHLY_BUDGET_USD);

  const last50 = await AiRun.find({ cache: { $ne: "HIT" } }).sort({ createdAt: -1 }).limit(50).select("outcome latencyMs createdAt").lean();
  const lastOk = last50.find((r) => r.outcome === "ok") || null;

  if (budgetUsedPct >= 100) return { status: "paused", lastOkAt: lastOk?.createdAt || null, p50LatencyMs: null, budgetUsedPct };

  const last5 = last50.slice(0, 5);
  const dayAgo = new Date(Date.now() - 86400000);
  const anyOkLast24h = last50.some((r) => r.outcome === "ok" && r.createdAt >= dayAgo);
  const anyErrorLast24h = last50.some((r) => r.outcome !== "ok" && r.createdAt >= dayAgo);
  const allFailedLast5 = last5.length === 5 && last5.every((r) => r.outcome !== "ok");

  const latencies = last50.map((r) => r.latencyMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;

  const hourAgo = new Date(Date.now() - 3600000);
  const lastHour = last50.filter((r) => r.createdAt >= hourAgo);
  const errorRateLastHour = lastHour.length ? lastHour.filter((r) => r.outcome !== "ok").length / lastHour.length : 0;

  let status = "online";
  if (allFailedLast5 || (anyErrorLast24h && !anyOkLast24h)) status = "offline";
  else if (errorRateLastHour > 0.2 || (p50 != null && p50 > 15000)) status = "degraded";

  return { status, lastOkAt: lastOk?.createdAt || null, p50LatencyMs: p50, budgetUsedPct };
}

export function computeLiteHealth() {
  return cached("ai:health:lite", 30, computeLiteHealthUncached);
}

async function checkOpenAiConnectivityUncached() {
  if (!process.env.OPENAI_API_KEY) return { ok: false, ms: null, checkedAt: new Date().toISOString() };
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: ctrl.signal,
    });
    return { ok: res.ok, ms: Date.now() - started, checkedAt: new Date().toISOString() };
  } catch {
    return { ok: false, ms: Date.now() - started, checkedAt: new Date().toISOString() };
  } finally {
    clearTimeout(t);
  }
}

export function checkOpenAiConnectivity() {
  return cached("ai:health:connectivity", 300, checkOpenAiConnectivityUncached);
}

function healthHeadline({ score, successPct, latencyScore, groundingPct, budgetHeadroom, feedbackScore, byFeature }) {
  if (!AI_ENABLED) return "AI is disabled (AI_ENABLED=0)";
  if (!process.env.OPENAI_API_KEY) return "OpenAI key not configured";
  if (score >= 85) return "All systems nominal";
  const factors = [
    { score: latencyScore, text: "high latency" },
    { score: successPct, text: "elevated error rate" },
    { score: groundingPct, text: "low grounding rate" },
    { score: budgetHeadroom, text: "budget pressure" },
    { score: feedbackScore, text: "negative feedback" },
  ].sort((a, b) => a.score - b.score);
  const worstFeature = [...byFeature].sort((a, b) => b.errorRate - a.errorRate || b.p95 - a.p95)[0];
  return `Degraded: ${factors[0].text}${worstFeature && (worstFeature.errorRate > 0 || worstFeature.p95 > 8000) ? ` on ${worstFeature.title}` : ""}`;
}

export async function computeAiHealthReport({ from = "", to = "" } = {}) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  const nonHit = { ...match, cache: { $ne: "HIT" } };
  const mStart = monthStart();

  const [
    [facet],
    [sanyaMtdAgg],
    [aiRunMtdAgg],
    feedbackByFeature,
    insightLastByFeature,
    globalLastRunByFeature,
    sanyaDaily,
  ] = await Promise.all([
    AiRun.aggregate([
      {
        $facet: {
          totals: [
            { $match: match },
            {
              $group: {
                _id: null,
                runs: { $sum: 1 },
                hit: { $sum: { $cond: [{ $eq: ["$cache", "HIT"] }, 1, 0] } },
                miss: { $sum: { $cond: [{ $eq: ["$cache", "MISS"] }, 1, 0] } },
                forced: { $sum: { $cond: [{ $eq: ["$cache", "FORCED"] }, 1, 0] } },
                ok: { $sum: { $cond: [{ $eq: ["$outcome", "ok"] }, 1, 0] } },
                promptTokens: { $sum: "$promptTokens" },
                completionTokens: { $sum: "$completionTokens" },
                costUsd: { $sum: "$costUsd" },
              },
            },
          ],
          nonHitCount: [{ $match: nonHit }, { $count: "n" }],
          nonHitOk: [{ $match: { ...nonHit, outcome: "ok" } }, { $count: "n" }],
          byOutcome: [{ $match: match }, { $group: { _id: "$outcome", count: { $sum: 1 } } }],
          latency: [{ $match: nonHit }, { $group: { _id: null, avg: { $avg: "$latencyMs" }, all: { $push: "$latencyMs" } } }],
          stageMs: [
            { $match: nonHit },
            { $group: { _id: null, collect: { $avg: "$stageMs.collect" }, compute: { $avg: "$stageMs.compute" }, analyze: { $avg: "$stageMs.analyze" }, verify: { $avg: "$stageMs.verify" } } },
          ],
          byFeature: [
            { $match: match },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: "$feature",
                runs: { $sum: 1 },
                hit: { $sum: { $cond: [{ $eq: ["$cache", "HIT"] }, 1, 0] } },
                nonHitRuns: { $sum: { $cond: [{ $eq: ["$cache", "HIT"] }, 0, 1] } },
                errors: { $sum: { $cond: [{ $and: [{ $ne: ["$cache", "HIT"] }, { $ne: ["$outcome", "ok"] }] }, 1, 0] } },
                costUsd: { $sum: "$costUsd" },
                promptTokens: { $sum: "$promptTokens" },
                completionTokens: { $sum: "$completionTokens" },
                lastRunAt: { $first: "$createdAt" },
                lastOutcome: { $first: "$outcome" },
                groundedChecked: { $sum: { $cond: [{ $ne: ["$grounded", null] }, 1, 0] } },
                groundedTrue: { $sum: { $cond: [{ $eq: ["$grounded", true] }, 1, 0] } },
                latencies: { $push: { $cond: [{ $ne: ["$cache", "HIT"] }, "$latencyMs", "$$REMOVE"] } },
              },
            },
          ],
          dailyCost: [{ $match: match }, { $group: { _id: istDayBucket("$createdAt"), costUsd: { $sum: "$costUsd" } } }, { $sort: { _id: 1 } }],
          grounding: [
            { $match: { ...match, grounded: { $ne: null } } },
            { $group: { _id: null, checked: { $sum: 1 }, grounded: { $sum: { $cond: ["$grounded", 1, 0] } }, avgUngrounded: { $avg: "$ungroundedCount" } } },
          ],
          confidence: [{ $match: { ...match, confidence: { $ne: null } } }, { $group: { _id: "$confidence", count: { $sum: 1 } } }],
          recentErrors: [
            { $match: { ...match, outcome: { $ne: "ok" } } },
            { $sort: { createdAt: -1 } },
            { $limit: 20 },
            { $project: { _id: 0, createdAt: 1, feature: 1, outcome: 1, errorMessage: 1, model: 1 } },
          ],
          pii: [{ $match: { ...match, outcome: "pii_blocked" } }, { $group: { _id: null, count: { $sum: 1 }, lastAt: { $max: "$createdAt" } } }],
        },
      },
    ]),
    SanyaUsage.aggregate([{ $match: { createdAt: { $gte: mStart } } }, { $group: { _id: null, cost: { $sum: "$costUsd" } } }]),
    AiRun.aggregate([{ $match: { createdAt: { $gte: mStart } } }, { $group: { _id: null, cost: { $sum: "$costUsd" } } }]),
    AiInsight.aggregate([{ $group: { _id: "$feature", up: { $sum: "$feedback.up" }, down: { $sum: "$feedback.down" } } }]),
    AiInsight.aggregate([{ $group: { _id: "$feature", lastGeneratedAt: { $max: "$generatedAt" } } }]),
    AiRun.aggregate([{ $sort: { createdAt: -1 } }, { $group: { _id: "$feature", lastRunAt: { $first: "$createdAt" }, lastOutcome: { $first: "$outcome" }, lastCache: { $first: "$cache" } } }]),
    SanyaUsage.aggregate([{ $match: match.createdAt ? { createdAt: match.createdAt } : {} }, { $group: { _id: istDayBucket("$createdAt"), costUsd: { $sum: "$costUsd" } } }, { $sort: { _id: 1 } }]),
  ]);

  const t = facet.totals?.[0] || { runs: 0, hit: 0, miss: 0, forced: 0, ok: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
  const nonHitCount = facet.nonHitCount?.[0]?.n || 0;
  const nonHitOk = facet.nonHitOk?.[0]?.n || 0;
  const lat = facet.latency?.[0];
  const latSorted = (lat?.all || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const p50 = percentileOf(latSorted, 0.5);
  const p95 = percentileOf(latSorted, 0.95);
  const stage = facet.stageMs?.[0] || {};
  const grounding = facet.grounding?.[0] || { checked: 0, grounded: 0, avgUngrounded: 0 };
  const pii = facet.pii?.[0] || { count: 0, lastAt: null };

  const feedbackByFeatureMap = new Map(feedbackByFeature.map((f) => [f._id, { up: f.up || 0, down: f.down || 0 }]));
  const insightLastMap = new Map(insightLastByFeature.map((f) => [f._id, f.lastGeneratedAt]));
  const globalLastRunMap = new Map(globalLastRunByFeature.map((f) => [f._id, f]));

  const byFeature = (facet.byFeature || []).map((f) => {
    const meta = FEATURES[f._id] || {};
    const sorted = (f.latencies || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    const fb = feedbackByFeatureMap.get(f._id) || { up: 0, down: 0 };
    return {
      feature: f._id, title: meta.title || f._id, page: meta.page || "",
      runs: f.runs, hitRate: pct(f.hit, f.runs), errorRate: pct(f.errors, f.nonHitRuns || f.runs),
      p95: percentileOf(sorted, 0.95) || 0, costUsd: round2(f.costUsd),
      promptTokens: f.promptTokens || 0, completionTokens: f.completionTokens || 0,
      lastRunAt: f.lastRunAt, lastOutcome: f.lastOutcome,
      groundedRate: pct(f.groundedTrue, f.groundedChecked),
      feedbackUp: fb.up, feedbackDown: fb.down,
    };
  });

  
  const coverage = Object.entries(FEATURES).map(([key, meta]) => {
    const lastGeneratedAt = insightLastMap.get(key) || null;
    const lastRun = globalLastRunMap.get(key) || null;
    const ttlMin = Math.min(...Object.values(meta.ttlMin || AI_DEFAULT_TTL_MIN).filter(Number.isFinite));
    const ttlMs = (Number.isFinite(ttlMin) ? ttlMin : 60) * 60_000;
    let status = "never";
    if (lastRun && lastRun.lastOutcome !== "ok" && lastRun.lastCache !== "HIT") status = "failing";
    else if (lastGeneratedAt) status = Date.now() - new Date(lastGeneratedAt).getTime() < ttlMs ? "fresh" : "stale";
    return { feature: key, title: meta.title || key, page: meta.page || "", kinds: meta.kinds || [], lastGeneratedAt, status };
  });

  const insightsMtd = round2(aiRunMtdAgg?.cost || 0);
  const sanyaMtd = round2(sanyaMtdAgg?.cost || 0);
  const insightsProjected = projectMonthEnd(insightsMtd);
  const sanyaProjected = projectMonthEnd(sanyaMtd);
  const budget = {
    insights: { mtdUsd: insightsMtd, ceilingUsd: AI_MONTHLY_BUDGET_USD, usedPct: pct(insightsMtd, AI_MONTHLY_BUDGET_USD), projectedUsd: insightsProjected, projectedPct: pct(insightsProjected, AI_MONTHLY_BUDGET_USD) },
    sanya: { mtdUsd: sanyaMtd, ceilingUsd: SANYA_MONTHLY_BUDGET_USD, usedPct: pct(sanyaMtd, SANYA_MONTHLY_BUDGET_USD), projectedUsd: sanyaProjected, projectedPct: pct(sanyaProjected, SANYA_MONTHLY_BUDGET_USD) },
  };

  
  const dailyMap = new Map();
  for (const d of facet.dailyCost || []) dailyMap.set(d._id, { date: d._id, insightsCost: round2(d.costUsd), sanyaCost: 0 });
  for (const d of sanyaDaily || []) {
    const row = dailyMap.get(d._id) || { date: d._id, insightsCost: 0, sanyaCost: 0 };
    row.sanyaCost = round2(d.costUsd);
    dailyMap.set(d._id, row);
  }
  const dailyCost = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const totalFeedbackUp = [...feedbackByFeatureMap.values()].reduce((s, f) => s + f.up, 0);
  const totalFeedbackDown = [...feedbackByFeatureMap.values()].reduce((s, f) => s + f.down, 0);

  
  const successPct = pct(nonHitOk, nonHitCount);
  const latencyScore = p95 == null ? 100 : p95 <= 8000 ? 100 : p95 >= 30000 ? 0 : round1(100 - ((p95 - 8000) / (30000 - 8000)) * 100);
  const groundingPct = pct(grounding.grounded, grounding.checked) || (grounding.checked === 0 ? 100 : 0);
  const combinedProjectedPct = pct(insightsProjected + sanyaProjected, AI_MONTHLY_BUDGET_USD + SANYA_MONTHLY_BUDGET_USD);
  const budgetHeadroom = Math.max(0, round1(100 - combinedProjectedPct));
  const feedbackScore = totalFeedbackUp + totalFeedbackDown === 0 ? 100 : pct(totalFeedbackUp, totalFeedbackUp + totalFeedbackDown);
  const healthScore = Math.round(successPct * 0.35 + latencyScore * 0.2 + groundingPct * 0.2 + budgetHeadroom * 0.15 + feedbackScore * 0.1);
  const healthHeadlineText = healthHeadline({ score: healthScore, successPct, latencyScore, groundingPct: grounding.checked ? groundingPct : 100, budgetHeadroom, feedbackScore, byFeature });

  return {
    healthScore,
    healthHeadline: healthHeadlineText,
    healthBreakdown: { successPct, latencyScore, groundingPct: grounding.checked ? groundingPct : null, budgetHeadroom, feedbackScore },
    totals: {
      runs: t.runs, byCache: { HIT: t.hit, MISS: t.miss, FORCED: t.forced },
      byOutcome: Object.fromEntries((facet.byOutcome || []).map((o) => [o._id || "unknown", o.count])),
      tokens: { prompt: t.promptTokens, completion: t.completionTokens },
      costUsd: round2(t.costUsd),
      avgLatencyMs: Math.round(lat?.avg || 0), p50LatencyMs: p50 || 0, p95LatencyMs: p95 || 0,
    },
    stageMs: { collect: Math.round(stage.collect || 0), compute: Math.round(stage.compute || 0), analyze: Math.round(stage.analyze || 0), verify: Math.round(stage.verify || 0) },
    byFeature,
    dailyCost,
    budget,
    quality: {
      groundedRate: grounding.checked ? groundingPct : null, groundedChecked: grounding.checked,
      avgUngroundedPerRun: round1(grounding.avgUngrounded || 0),
      confidenceDistribution: Object.fromEntries((facet.confidence || []).map((c) => [c._id || "unknown", c.count])),
      feedback: { up: totalFeedbackUp, down: totalFeedbackDown },
    },
    privacy: { piiBlockedCount: pii.count, lastBlockedAt: pii.lastAt },
    recentErrors: (facet.recentErrors || []).map((e) => ({ ...e, errorMessage: (e.errorMessage || "").slice(0, 200) })),
    coverage,
    config: {
      models: { brief: AI_BRIEF_MODEL, deep: AI_DEEP_MODEL, sanya: SANYA_MODEL },
      monthlyBudgetUsd: AI_MONTHLY_BUDGET_USD, sanyaMonthlyBudgetUsd: SANYA_MONTHLY_BUDGET_USD,
      ttlDefaultsMin: AI_DEFAULT_TTL_MIN, outputLanguage: AI_OUTPUT_LANGUAGE,
      keyConfigured: !!process.env.OPENAI_API_KEY, aiEnabled: AI_ENABLED,
    },
  };
}
