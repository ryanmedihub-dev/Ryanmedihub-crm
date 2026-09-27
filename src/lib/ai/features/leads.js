import { GET as overviewGET } from "@/app/api/owner/leads/overview/route";
import { GET as reportGET } from "@/app/api/owner/leads/report/route";
import { GET as byStatusGET } from "@/app/api/owner/leads/by-status/route";
import { GET as retryGET } from "@/app/api/owner/leads/retry/route";
import { toISTDateKey } from "@/lib/owner/dates";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL } from "../config";
import { capPayload } from "./_helpers";

const SAMPLE_CAP = 200;

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const leadsFeatures = {
  "leads.overview": {
    title: "Leads Overview", page: "/owner/leads", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: ["dateFrom", "dateTo"],
    focus: { brief: "Lead pipeline health, and where leads stall in the funnel." },
    async collect(scope) {
      return callRoute(overviewGET, { path: "/api/owner/leads/overview", params: scope });
    },
    compute(raw, book, scope) {
      const s = raw.summary?.total || {};
      const sidebar = raw.sidebarStats || {};
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        totals: {
          leads: s.leads || 0, uncontacted: sidebar.uncontacted || 0, followUpsDue: sidebar.followUpsDue || 0,
          converted: sidebar.converted || 0, uniqueSources: sidebar.uniqueSources || 0,
        },
        statusMix: (raw.pieData || []).map((p) => ({ status: p.name, count: p.value })),
        sourceMix: (raw.sources || []).slice(0, 10).map((s2) => ({ source: s2.source, total: s2.total, conversionRate: s2.conversionRate })),
        dailyTrend: (raw.daywise || []).slice(-31).map((d) => ({ date: d.label, leads: d.total })),
      });
      return { facts, rowsAnalyzed: (raw.pieData || []).length };
    },
  },

  "leads.report": {
    title: "Lead Report Intelligence", page: "/owner/leads/report", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "status"],
    focus: { brief: "Source quality and team handling speed." },
    async collect(scope) {
      return callRoute(reportGET, { path: "/api/owner/leads/report", params: { ...scope, page: 1, pageSize: SAMPLE_CAP, sortBy: "createdAt", sortDir: "desc" } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const byDay = new Map(); const bySource = new Map(); const byTeam = new Map();
      for (const r of rows) {
        const day = toISTDateKey(r.createdAt);
        if (day) byDay.set(day, (byDay.get(day) || 0) + 1);
        bySource.set(r.source || "Unspecified", (bySource.get(r.source || "Unspecified") || 0) + 1);
        const team = r.assignedTo?.tlName || "Unassigned";
        byTeam.set(team, (byTeam.get(team) || 0) + 1);
      }
      const dataErrors = raw.total > rows.length ? [`Sample covers the most recent ${rows.length} of ${raw.total} leads.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        sampleSize: rows.length, totalInPeriod: raw.total || rows.length,
        byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })).slice(-31),
        bySource: topEntries(bySource, 10).map(([source, count]) => ({ source, count })),
        byTeam: topEntries(byTeam, 10).map(([tl, count]) => ({ team: book.alias("T", tl, tl), count })),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "leads.status": {
    title: "Lead Status Intelligence", page: "/owner/leads", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: ["dateFrom", "dateTo", "preset"],
    focus: {
      brief: "Check facts.preset and apply the matching angle: 'interested' = hot leads going cold (interested but no recent call) and who owns them; 'followUps' = overdue follow-ups and owner concentration, what to clear today; 'notInterested' = lost patterns by source, is a source producing junk; 'unattempted' = leads never called — age and source, a capacity problem or an assignment problem.",
    },
    async collect(scope) {
      return callRoute(byStatusGET, { path: "/api/owner/leads/by-status", params: { ...scope, page: 1, pageSize: SAMPLE_CAP, sortBy: "createdAt", sortDir: "desc" } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const now = Date.now();
      const ageBuckets = { "0-1d": 0, "2-3d": 0, "4-7d": 0, "8-30d": 0, "30+d": 0 };
      const bySource = new Map(); const byAgent = new Map();
      let overdue = 0;
      for (const r of rows) {
        const days = r.createdAt ? Math.floor((now - new Date(r.createdAt).getTime()) / 86400000) : null;
        if (days != null) {
          if (days <= 1) ageBuckets["0-1d"]++;
          else if (days <= 3) ageBuckets["2-3d"]++;
          else if (days <= 7) ageBuckets["4-7d"]++;
          else if (days <= 30) ageBuckets["8-30d"]++;
          else ageBuckets["30+d"]++;
        }
        bySource.set(r.source || "Unspecified", (bySource.get(r.source || "Unspecified") || 0) + 1);
        byAgent.set(r.assignedTo?.name || "Unassigned", (byAgent.get(r.assignedTo?.name || "Unassigned") || 0) + 1);
        if (scope.preset === "followUps" && r.followUpDate && new Date(r.followUpDate).getTime() < now) overdue++;
      }

      
      
      let recovery = null;
      if (raw.recovery) {
        const byStatus = new Map();
        for (const p of raw.recovery.recovered || []) byStatus.set(p.status, (byStatus.get(p.status) || 0) + 1);
        recovery = { recoveredCount: raw.recovery.recoveredCount || 0, byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })) };
      }

      const dataErrors = raw.total > rows.length ? [`Sample covers ${rows.length} of ${raw.total} leads in this preset.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        preset: scope.preset || "",
        sampleSize: rows.length, totalInPreset: raw.total || rows.length,
        ageBuckets, overdueCount: overdue,
        bySource: topEntries(bySource, 10).map(([source, count]) => ({ source, count })),
        byAgent: topEntries(byAgent, 10).map(([name, count]) => ({ alias: book.alias("E", name, name), count })),
        recovery,
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "leads.retry": {
    title: "Retry & Recovery Intelligence", page: "/owner/leads/retry", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: [],
    focus: { brief: "Which recovery bucket (P0–P4) is worth calling first, and why." },
    async collect() {
      return callRoute(retryGET, { path: "/api/owner/leads/retry", params: {} });
    },
    compute(raw) {
      const queue = raw.queue || {};
      const facts = capPayload({
        totalMatching: raw.totalMatching || 0,
        truncated: !!raw.truncated,
        byPriority: Object.entries(raw.byPriority || {}).map(([priority, count]) => ({ priority, count })),
        queueSizes: Object.fromEntries(Object.entries(queue).map(([k, v]) => [k, (v || []).length])),
      });
      return { facts, rowsAnalyzed: raw.totalMatching || 0 };
    },
  },
};

export default leadsFeatures;
