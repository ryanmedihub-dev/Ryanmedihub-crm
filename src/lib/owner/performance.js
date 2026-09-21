// Employee performance scoring (Owner Panel v2, Part 1).
//
// This is used to judge people, so every rule here is explicit, documented, and
// normalized against PEERS IN THE SAME ROLE BUCKET OVER THE SAME PERIOD — never
// an absolute threshold, and never blended with salary/incentive. Below a
// minimum sample size the result is "insufficient data", never a letter grade —
// someone with 3 calls this week is not "Bad", they're unmeasured.
//
// This module is pure (no DB access): callers compute the raw metric inputs per
// employee (from Patient/Payable/Interviewer/callby aggregations) and pass them
// in as a flat number per metric key; this module only ranks and bands them.

export const PERFORMANCE_BANDS = ["Excellent", "Good", "Average", "Bad"];

// Per-role formula: which metrics feed the score, their weight (sums to 1),
// whether higher-is-better (default) or lower-is-better (`invert: true`), and
// the minimum sample size (on `sampleField`) below which the employee is
// reported as "insufficient data" instead of scored.
export const ROLE_PERFORMANCE_CONFIG = {
  Agent: {
    minSample: 5,
    // Must match a key buildAgentMetrics emits (src/lib/owner/employeeReportQuery.js).
    // Was "totalLeads" — dropped along with every other lead-status metric in the
    // engagement-metrics rework, so the sample is now call volume instead of lead count.
    sampleField: "totalCalls",
    sampleLabel: "calls made",
    metrics: [
      { key: "connectRate", label: "Connect rate", weight: 0.35 },
      { key: "conversionRate", label: "Conversion rate", weight: 0.4 },
      { key: "targetAttainment", label: "Call volume vs. daily target", weight: 0.25 },
    ],
  },
  Counsellor: {
    minSample: 3,
    sampleField: "patientsConsulted",
    sampleLabel: "patients consulted",
    metrics: [
      { key: "conversionRate", label: "Conversion rate", weight: 0.5 },
      { key: "revenuePerPatient", label: "Revenue per patient", weight: 0.3 },
      { key: "avgDiscount", label: "Avg. discount given", weight: 0.2, invert: true },
    ],
  },
  Surgery: {
    minSample: 2,
    sampleField: "patientsOperated",
    sampleLabel: "patients operated",
    metrics: [
      { key: "graftsPerSurgery", label: "Grafts per surgery", weight: 0.5 },
      { key: "surgeryVolume", label: "Surgery volume", weight: 0.5 },
    ],
  },
  HR: {
    minSample: 3,
    sampleField: "totalInterviews",
    sampleLabel: "interviews conducted",
    metrics: [
      { key: "selectionRate", label: "Selection rate", weight: 0.6 },
      { key: "interviewVolume", label: "Interview volume", weight: 0.4 },
    ],
  },
  // "Other" spans unrelated designations (reception, housekeeping, accountant,
  // CEO, ...) with no common KPI — deliberately no formula. Callers must check
  // for a missing config and render "no KPI for this role", not a fabricated score.
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Fraction of `values` that are <= `value` — a simple, explainable percentile rank. */
function percentileRank(values, value) {
  if (!values.length) return 0;
  let count = 0;
  for (const v of values) if (v <= value) count++;
  return count / values.length;
}

function bandFromPercentile(p) {
  if (p >= 0.75) return "Excellent";
  if (p >= 0.5) return "Good";
  if (p >= 0.25) return "Average";
  return "Bad";
}

/**
 * Score a whole cohort (one role bucket, one period) at once, so percentiles are
 * computed against real peers.
 *
 * @param section one of ROLE_PERFORMANCE_CONFIG's keys
 * @param cohort   [{ id, sample: number, metrics: { [metricKey]: number } }, ...]
 * @returns Map<id, { insufficientData, band, score, explanation }>
 */
export function scoreCohort(section, cohort) {
  const config = ROLE_PERFORMANCE_CONFIG[section];
  const results = new Map();
  if (!config) {
    // "Other" (and any future unmapped section) — no formula, not a fabricated score.
    for (const row of cohort) {
      results.set(row.id, { insufficientData: null, band: null, score: null, explanation: [] });
    }
    return results;
  }

  const scorable = cohort.filter((row) => toNum(row.sample) >= config.minSample);

  // Peer value pools per metric, built only from scorable peers.
  const pools = {};
  for (const m of config.metrics) {
    pools[m.key] = scorable.map((row) => toNum(row.metrics?.[m.key]));
  }

  for (const row of cohort) {
    if (toNum(row.sample) < config.minSample) {
      results.set(row.id, {
        insufficientData: true,
        band: null,
        score: null,
        explanation: [],
        sample: toNum(row.sample),
        sampleField: config.sampleField,
        sampleLabel: config.sampleLabel,
        minSample: config.minSample,
      });
      continue;
    }

    let weighted = 0;
    const explanation = [];
    for (const m of config.metrics) {
      const value = toNum(row.metrics?.[m.key]);
      const rawPercentile = percentileRank(pools[m.key], value);
      const percentile = m.invert ? 1 - rawPercentile : rawPercentile;
      const contribution = percentile * m.weight;
      weighted += contribution;
      explanation.push({ key: m.key, label: m.label, value, weight: m.weight, percentile, contribution });
    }

    results.set(row.id, {
      insufficientData: false,
      band: bandFromPercentile(weighted),
      score: Math.round(weighted * 100),
      explanation,
      sample: toNum(row.sample),
      sampleField: config.sampleField,
      sampleLabel: config.sampleLabel,
      minSample: config.minSample,
    });
  }

  return results;
}

/**
 * Team-level performance for the Leadership page: the mean of member scores,
 * excluding members with insufficient data. A team with zero scored members is
 * itself "insufficient data".
 */
export function teamPerformanceFromMembers(memberResults) {
  const scored = memberResults.filter((r) => r && r.insufficientData === false);
  if (!scored.length) {
    return { insufficientData: true, band: null, score: null, scoredCount: 0, totalCount: memberResults.length };
  }
  const avgWeighted = scored.reduce((s, r) => s + r.score / 100, 0) / scored.length;
  return {
    insufficientData: false,
    band: bandFromPercentile(avgWeighted),
    score: Math.round(avgWeighted * 100),
    scoredCount: scored.length,
    totalCount: memberResults.length,
  };
}
