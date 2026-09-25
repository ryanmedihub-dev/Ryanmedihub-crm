import { GET as suggestionsGET } from "@/app/api/owner/ai/suggestions/route";
import { GET as attendanceGET } from "@/app/api/owner/ai/attendance/route";
import { getAttentionItems } from "@/lib/owner/metrics/attention";
import { computeAiHealthReport } from "../health";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL } from "../config";
import { capPayload } from "./_helpers";

// AI section pages — meta features about the owner panel's own rule engines
// (Attention/Suggestions/Attendance are deliberately NOT AI; these features
// add an AI triage layer on top of their already-computed, non-AI output)
// plus ai.selfDiagnosis, which analyses the AI system itself.

const aiopsFeatures = {
  "ai.attention": {
    title: "Attention", page: "/owner/ai/attention", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: ["from", "to"],
    focus: { brief: "Triage: rank the flagged rules by money at risk and urgency; what to clear first today." },
    async collect(scope) {
      return getAttentionItems({ from: scope.from || "", to: scope.to || "" });
    },
    compute(raw, book, scope) {
      const rules = (raw.rules || []).map((r) => ({ key: r.key, label: r.label, count: r.count, valueAtRisk: r.valueAtRisk || 0, dataUnavailable: !!r.error }));
      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" },
        totalFlagged: raw.totalFlagged || 0, totalValueAtRisk: raw.totalValueAtRisk || 0,
        rules,
      });
      return { facts, rowsAnalyzed: rules.length };
    },
  },

  "ai.suggestions": {
    title: "Suggestions", page: "/owner/ai/suggestions", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 120 },
    scopeParams: ["dateFrom", "dateTo"],
    focus: { brief: "Act as strategist over these rule-based observations: prioritise, connect related ones, turn each top one into a concrete action." },
    async collect(scope) {
      return callRoute(suggestionsGET, { path: "/api/owner/ai/suggestions", params: scope });
    },
    compute(raw, book, scope) {
      const observations = raw.observations || [];
      const facts = capPayload({
        period: raw.period || { from: scope.dateFrom || "", to: scope.dateTo || "" },
        previousPeriod: raw.previousPeriod || null,
        observations: observations.map((o) => ({ id: o.id, category: o.category, headline: o.headline, detail: o.detail })),
      });
      return { facts, rowsAnalyzed: observations.length };
    },
  },

  "ai.attendance": {
    title: "Attendance", page: "/owner/ai/attendance", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["date", "branch"],
    focus: { brief: "Attendance pattern: late/absent concentration by team; impact on call capacity. This source is a single-day register, not a multi-day trend — say so if asked about trend." },
    async collect(scope) {
      return callRoute(attendanceGET, { path: "/api/owner/ai/attendance", params: { ...scope, page: 1, pageSize: 200, sortBy: "name" } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const byBranch = new Map();
      const flagged = [];
      for (const r of rows) {
        const status = r.markedStatus || r.suggestedStatus || "Unmarked";
        const key = r.branch || "Unspecified";
        if (!byBranch.has(key)) byBranch.set(key, { branch: key, present: 0, halfDay: 0, absent: 0, leave: 0, holiday: 0, unmarked: 0 });
        const b = byBranch.get(key);
        if (status === "Present") b.present += 1;
        else if (status === "Half-day") b.halfDay += 1;
        else if (status === "Absent") b.absent += 1;
        else if (status === "Leave") b.leave += 1;
        else if (status === "Holiday") b.holiday += 1;
        else b.unmarked += 1;
        if (status === "Absent") flagged.push({ employee: book.alias("E", r.employeeId, r.name), branch: r.branch, role: r.role });
      }
      const dataErrors = [...(raw.callbyError ? [raw.callbyError] : []), "Single-day register — no multi-day/day-of-week trend is available from this source."];
      const facts = capPayload({
        date: raw.date, summary: raw.summary || {},
        byBranch: [...byBranch.values()],
        flaggedAbsent: flagged.slice(0, 20),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "ai.selfDiagnosis": {
    title: "AI Health", page: "/owner/ai/health", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["from", "to"],
    focus: { brief: "Diagnose the AI system itself: reliability, latency, cost trajectory vs budget, grounding and feedback quality; recommend config changes (model/ttl/budget)." },
    async collect(scope) {
      return computeAiHealthReport({ from: scope.from || "", to: scope.to || "" });
    },
    compute(raw, book, scope) {
      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" },
        healthScore: raw.healthScore, healthBreakdown: raw.healthBreakdown,
        totals: raw.totals, stageMs: raw.stageMs,
        byFeature: raw.byFeature.slice(0, 20),
        budget: raw.budget, quality: raw.quality, privacy: raw.privacy,
        coverage: raw.coverage.map((c) => ({ feature: c.feature, status: c.status })),
        config: raw.config,
      });
      return { facts, rowsAnalyzed: raw.byFeature.length };
    },
  },
};

export default aiopsFeatures;
