import { GET as overviewGET } from "@/app/api/owner/hr/overview/route";
import { GET as interviewsGET } from "@/app/api/owner/hr/interviews/route";
import { GET as byStatusGET } from "@/app/api/owner/hr/by-status/route";
import { GET as byPositionGET } from "@/app/api/owner/hr/by-position/route";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL } from "../config";
import { round, capPayload } from "./_helpers";

// Candidates are private individuals — aliased K## (never P##, which is
// reserved for patients). Payloads: counts, rates, time-to-decision, by
// position, by source, by interviewer (aliased E). No candidate names,
// phones, CV text, or remarks ever leave compute().
const SAMPLE_CAP = 200;

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const hrFeatures = {
  "hr.overview": {
    title: "HR Overview", page: "/owner/hr", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo"],
    focus: { brief: "Hiring pipeline health: volume, selection rate, joining rate, slow stages." },
    async collect(scope) {
      return callRoute(overviewGET, { path: "/api/owner/hr/overview", params: scope });
    },
    compute(raw, book, scope) {
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        totals: { total: raw.total || 0, selected: raw.selected || 0, rejected: raw.rejected || 0, onHold: raw.onHold || 0, selectionRate: raw.selectionRate || 0, avgDaysToDecision: raw.avgDaysToDecision },
        byPosition: raw.byPosition || [],
        dailyTrend: (raw.daywise || []).slice(-31),
      });
      return { facts, rowsAnalyzed: (raw.byPosition || []).length };
    },
  },

  "hr.interviews": {
    title: "All Interviews", page: "/owner/hr/interviews", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "status", "experienceType"],
    focus: { brief: "Interview throughput by position and interviewer; backlog (Applied / Interview Scheduled, not yet decided)." },
    async collect(scope) {
      return callRoute(interviewsGET, { path: "/api/owner/hr/interviews", params: { ...scope, page: 1, pageSize: SAMPLE_CAP, sortBy: "date", sortDir: "desc" } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const byPosition = new Map(); const byInterviewer = new Map(); const bySource = new Map();
      let backlog = 0;
      for (const r of rows) {
        byPosition.set(r.position || "Unspecified", (byPosition.get(r.position || "Unspecified") || 0) + 1);
        const hr = r.assignedHr?.name || "Unassigned";
        byInterviewer.set(hr, (byInterviewer.get(hr) || 0) + 1);
        bySource.set(r.source || "Unspecified", (bySource.get(r.source || "Unspecified") || 0) + 1);
        if (r.status === "Applied" || r.status === "Interview Scheduled") backlog += 1;
      }
      const dataErrors = raw.total > rows.length ? [`Sample covers the most recent ${rows.length} of ${raw.total} interviews.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        sampleSize: rows.length, totalInPeriod: raw.total || rows.length,
        totals: raw.totals || {}, backlogCount: backlog,
        byPosition: topEntries(byPosition, 10).map(([position, count]) => ({ position, count })),
        bySource: topEntries(bySource, 10).map(([source, count]) => ({ source, count })),
        byInterviewer: topEntries(byInterviewer, 10).map(([name, count]) => ({ interviewer: name === "Unassigned" ? "Unassigned" : book.alias("E", name, name), count })),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "hr.status": {
    title: "Interview Status", page: "/owner/hr", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "preset"],
    focus: {
      brief: "Check facts.preset. 'selected' = offer→join conversion, positions filled vs open. 'rejected' = rejection pattern by position; is sourcing the issue.",
    },
    async collect(scope) {
      return callRoute(byStatusGET, { path: "/api/owner/hr/by-status", params: { ...scope, page: 1, pageSize: SAMPLE_CAP, sortBy: "date", sortDir: "desc" } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const dataErrors = raw.total > rows.length ? [`Sample covers ${rows.length} of ${raw.total} candidates in this preset.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        preset: scope.preset || "",
        sampleSize: rows.length, totalInPreset: raw.total || rows.length,
        joinedCount: scope.preset === "selected" ? rows.filter((r) => r.hiredEmployeeId).length : null,
        byPosition: raw.byPosition || null,
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "hr.byPosition": {
    title: "By Position", page: "/owner/hr/by-position", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo"],
    focus: { brief: "Which positions are hard to fill and why — volume vs selection rate vs time to fill." },
    async collect(scope) {
      return callRoute(byPositionGET, { path: "/api/owner/hr/by-position", params: { ...scope, page: 1, pageSize: SAMPLE_CAP, sortBy: "interviews", sortDir: "desc" } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const dataErrors = raw.total > rows.length ? [`Sample covers ${rows.length} of ${raw.total} positions.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        summary: raw.summary || {},
        positions: rows.map((r) => ({
          position: r.position, interviews: r.interviews, selected: r.selected, rejected: r.rejected, onHold: r.onHold,
          selectionRate: r.selectionRate, avgExpectedSalary: round(r.avgExpectedSalary), avgFinalSalary: r.avgFinalSalary != null ? round(r.avgFinalSalary) : null, avgDaysToFill: r.avgDaysToFill,
        })),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },
};

export default hrFeatures;
