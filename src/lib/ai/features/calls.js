import { GET as overviewGET } from "@/app/api/owner/calls/overview/route";
import { GET as liveGET } from "@/app/api/owner/calls/live/route";
import { GET as reportGET } from "@/app/api/owner/calls/report/route";
import { GET as employeeReportGET } from "@/app/api/owner/calls/employee-report/route";
import { GET as untrackedGET } from "@/app/api/owner/calls/untracked/route";
import { GET as forecastGET } from "@/app/api/owner/forecast/route";
import { toISTDateKey } from "@/lib/owner/dates";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL } from "../config";
import { round, pct, topN, bottomN, sumBy, capPayload } from "./_helpers";

const SAMPLE_CAP = 200;

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2, 1);
}
function avgBy(rows, key) {
  return rows.length ? sumBy(rows, key) / rows.length : 0;
}

function istDayFraction() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return (h + m / 60) / 24;
}

const callsFeatures = {
  "calls.overview": {
    title: "Calls Overview", page: "/owner/calls", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: ["dateFrom", "dateTo"],
    focus: { brief: "Calling health today vs target: volume, connect quality, peak/dead hours." },
    async collect(scope) {
      return callRoute(overviewGET, { path: "/api/owner/calls/overview", params: scope });
    },
    compute(raw, book, scope) {
      const selected = raw.selected || {};
      const callsPerHour = raw.callsPerHour || [];
      const peak = callsPerHour.length ? callsPerHour.reduce((a, b) => (b.count > a.count ? b : a)) : null;
      const trough = callsPerHour.length ? callsPerHour.reduce((a, b) => (b.count < a.count ? b : a)) : null;
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        totals: {
          totalCalls: selected.totalCalls || 0, connectedCalls: selected.connectedCalls || 0,
          uniqueClients: selected.uniqueClients || 0, callDurationSec: selected.callDurationSec || 0,
        },
        rates: { connectRate: pct(selected.connectedCalls, selected.totalCalls) },
        hourDistribution: {
          peakHour: peak?.hour ?? null, peakCount: peak?.count ?? 0,
          troughHour: trough?.hour ?? null, troughCount: trough?.count ?? 0,
          hoursWithData: callsPerHour.length,
        },
      });
      return { facts, rowsAnalyzed: callsPerHour.length };
    },
  },

  "calls.live": {
    title: "Live Floor Monitor", page: "/owner/calls/live", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 3 },
    scopeParams: [],
    focus: { brief: "Live floor monitor: who is behind pace right now, is the floor under-staffed at this hour. Very short, operational." },
    async collect() {
      return callRoute(liveGET, { path: "/api/owner/calls/live", params: {} });
    },
    compute(raw, book) {
      const agents = raw.agents || [];
      const active = agents.filter((a) => a.isActive);
      const dayFraction = istDayFraction();
      const paced = active.map((a) => {
        const target = a.dailyTarget || 100;
        const callsSoFar = a.calls?.total || 0;
        const expectedByNow = round(target * dayFraction);
        return { alias: book.alias("E", a.employeeId || a.name, a.name), callsSoFar, expectedByNow, gap: callsSoFar - expectedByNow };
      });
      const belowPace = paced.filter((p) => p.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 10);
      const facts = capPayload({
        generatedAt: raw.generatedAt || null,
        dayFractionElapsed: round(dayFraction * 100, 0),
        agentsTotal: agents.length, agentsActive: active.length, agentsInactive: agents.length - active.length,
        belowPaceCount: paced.filter((p) => p.gap < 0).length,
        belowPace,
        avgCallsSoFar: active.length ? round(sumBy(paced, "callsSoFar") / active.length) : 0,
      });
      return { facts, rowsAnalyzed: agents.length };
    },
  },

  "calls.report": {
    title: "Call Report Intelligence", page: "/owner/calls/report", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "callType", "connectedOnly"],
    focus: { brief: "Trend and quality of calls over the period; anomalies such as a sudden drop on one day." },
    async collect(scope) {
      return callRoute(reportGET, { path: "/api/owner/calls/report", params: { ...scope, page: 1, pageSize: SAMPLE_CAP, sortBy: "timestamp", sortDir: "desc" } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const byDay = new Map(); const byType = new Map(); const byAgent = new Map();
      for (const r of rows) {
        const day = toISTDateKey(r.timestamp);
        if (day) byDay.set(day, (byDay.get(day) || 0) + 1);
        const t = r.callType || "unknown";
        byType.set(t, (byType.get(t) || 0) + 1);
        const name = r.employeeName || "Unknown";
        if (!byAgent.has(name)) byAgent.set(name, { calls: 0, totalDuration: 0 });
        const a = byAgent.get(name);
        a.calls += 1; a.totalDuration += r.duration || 0;
      }
      const agentRows = [...byAgent.entries()].map(([name, v]) => ({
        alias: book.alias("E", name, name), calls: v.calls, avgDurationSec: v.calls ? round(v.totalDuration / v.calls) : 0,
      }));
      const dataErrors = raw.total > rows.length ? [`Sample covers the most recent ${rows.length} of ${raw.total} calls.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        sampleSize: rows.length, totalInPeriod: raw.total || rows.length,
        byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })).slice(-31),
        byType: [...byType.entries()].map(([type, count]) => ({ type, count })),
        avgDurationSec: round(avgBy(rows, "duration")),
        top5: topN(agentRows, "calls", 5),
        bottom5: bottomN(agentRows, "calls", 5),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "calls.employeeReport": {
    
    
    
    
    title: "Employee Call Report Intelligence", page: "/owner/calls/employee-report", kinds: ["brief", "verdicts"],
    model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 60, verdicts: 60 },
    scopeParams: ["dateFrom", "dateTo"],
    focus: {
      brief: "Per-agent calling discipline vs the 100/day target and connect quality.",
      verdicts: "Rate each agent against the cohort medians for calls and target attainment. 'insufficient_data' when no target is set.",
    },
    async collect(scope) {
      return callRoute(employeeReportGET, { path: "/api/owner/calls/employee-report", params: scope });
    },
    compute(raw, book, scope, kind) {
      const rows = raw.rows || [];
      const rowFacts = (r) => ({
        totalCalls: r.totalCalls || 0, connectedCalls: r.connectedCalls || 0,
        connectRate: r.connectRate || 0, targetAttainment: r.targetAttainment, dailyTarget: r.dailyTarget || 0,
      });
      const commonRow = (r) => ({ alias: book.alias("E", r.employeeId || r.name, r.name), ...rowFacts(r) });
      const period = { from: scope.dateFrom || "", to: scope.dateTo || "" };

      if (kind === "verdicts") {
        const facts = capPayload({
          period,
          cohort: { medianCalls: median(rows.map((r) => r.totalCalls)), medianAttainment: median(rows.map((r) => r.targetAttainment)) },
          agents: rows.map(commonRow),
        });
        return { facts, rowsAnalyzed: rows.length };
      }

      const scored = rows.filter((r) => r.targetAttainment != null).map((r) => ({ ...r, score: r.targetAttainment }));
      const facts = capPayload({
        period,
        cohort: { headcount: rows.length },
        totals: { totalCalls: sumBy(rows, "totalCalls"), connectedCalls: sumBy(rows, "connectedCalls") },
        rates: { connectRate: pct(sumBy(rows, "connectedCalls"), sumBy(rows, "totalCalls")), avgAttainment: round(avgBy(scored, "targetAttainment")) },
        top5: topN(scored, "score", 5).map(commonRow),
        bottom5: bottomN(scored, "score", 5).map(commonRow),
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "calls.untracked": {
    title: "Untracked Calls Intelligence", page: "/owner/calls/untracked", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: ["dateFrom", "dateTo"],
    focus: { brief: "Revenue leakage risk from calls with no lead record; which agents skip logging." },
    async collect(scope) {
      return callRoute(untrackedGET, { path: "/api/owner/calls/untracked", params: { ...scope, page: 1, pageSize: SAMPLE_CAP } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const byAgent = new Map(); const byHour = new Map();
      for (const r of rows) {
        const name = r.employeeName || "Unknown";
        byAgent.set(name, (byAgent.get(name) || 0) + 1);
        const dt = new Date(r.timestamp);
        if (!Number.isNaN(dt.getTime())) {
          const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(dt));
          byHour.set(h, (byHour.get(h) || 0) + 1);
        }
      }
      const dataErrors = raw.total > rows.length ? [`Sample covers ${rows.length} of ${raw.total} untracked calls.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        totalUntracked: raw.total || rows.length, totalCalls: raw.totalCalls || 0, untrackedPct: raw.untrackedPct || 0,
        byAgent: [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ alias: book.alias("E", name, name), count })),
        byHour: [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, count]) => ({ hour, count })),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "calls.forecast": {
    title: "Forecast & Staffing Intelligence", page: "/owner/calls/forecast", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 120 },
    scopeParams: [],
    focus: { brief: "Explain the forecast in plain words, the staffing gap, and how confident the underlying numbers are." },
    async collect() {
      return callRoute(forecastGET, { path: "/api/owner/forecast", params: {} });
    },
    compute(raw) {
      const d = raw.defaults || {};
      
      
      
      
      const assumedCapacityPerAgent = 15;
      const requiredAgents = assumedCapacityPerAgent > 0 ? Math.ceil((d.leadsPerDay || 0) / assumedCapacityPerAgent) : 0;
      const facts = capPayload({
        baseline: { leadsPerDay: d.leadsPerDay || 0, connectRate: d.connectRate || 0, consultRate: d.consultRate || 0, currentAgents: d.agents || 0 },
        liveDataAvailable: !!raw.liveDataAvailable,
        staffing: { assumedCapacityPerAgent, requiredAgents, agentGap: requiredAgents - (d.agents || 0) },
        dataErrors: raw.note ? [raw.note] : [],
      });
      return { facts, rowsAnalyzed: 1 };
    },
  },
};

export default callsFeatures;
