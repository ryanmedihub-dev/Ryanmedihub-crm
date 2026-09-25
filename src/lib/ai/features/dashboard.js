import { GET as dashboardGET } from "@/app/api/owner/dashboard/route";
import { GET as receivablesSummaryGET } from "@/app/api/receivables/summary/route";
import { GET as payablesSummaryGET } from "@/app/api/payables/summary/route";
import { callRoute } from "../sources";
import { AI_DEEP_MODEL } from "../config";
import { round, pct, sumBy, capPayload } from "./_helpers";

// receivables/payables summary routes treat an EMPTY branch param as "no
// filter" — the dashboard route instead uses the literal string "All" for
// that. Two different sentinels for the same UI concept; get this wrong and
// a branch filter silently returns zero receivable/payable rows.
function noFilterBranch(branch) {
  return !branch || branch === "All" ? undefined : branch;
}

const dashboardFeatures = {
  "dashboard.command": {
    title: "Dashboard",
    page: "/owner/dashboard",
    kinds: ["brief"],
    model: { brief: AI_DEEP_MODEL },
    ttlMin: { brief: 30 },
    scopeParams: ["branch", "from", "to"],
    focus: {
      brief: "Owner's morning briefing. What changed vs previous period and why, which branch is carrying/dragging revenue, biggest risk in attention items and receivables/payables, one people insight. Actions must link to the page where the owner can act.",
    },
    async collect(scope) {
      const branch = scope.branch || "All";
      const [dashRes, recRes, payRes] = await Promise.allSettled([
        callRoute(dashboardGET, { path: "/api/owner/dashboard", params: { from: scope.from, to: scope.to, branch } }),
        callRoute(receivablesSummaryGET, { path: "/api/receivables/summary", params: { branch: noFilterBranch(branch) } }),
        callRoute(payablesSummaryGET, { path: "/api/payables/summary", params: { branch: noFilterBranch(branch) } }),
      ]);
      const dataErrors = [];
      const pick = (label, res) => {
        if (res.status === "fulfilled") return res.value;
        dataErrors.push(`${label}: ${res.reason?.message || "failed"}`);
        return null;
      };
      return {
        dash: pick("Dashboard data", dashRes),
        rec: pick("Receivables", recRes),
        pay: pick("Payables", payRes),
        dataErrors,
      };
    },
    compute(raw, book, scope) {
      const { dash, rec, pay, dataErrors = [] } = raw;
      const d = dash || {};
      const revenue = d.revenue || {};
      const perDay = revenue.perDay || [];
      const perDayTrend = perDay.length
        ? {
            first: round(perDay[0].total), last: round(perDay[perDay.length - 1].total),
            min: round(Math.min(...perDay.map((p) => p.total))), max: round(Math.max(...perDay.map((p) => p.total))),
            avg: round(sumBy(perDay, "total") / perDay.length),
          }
        : null;

      const surgeriesByBranch = Object.entries(d.surgeries?.byBranch || {}).map(([branch, count]) => ({ branch, count }));

      const funnelStages = (d.funnel?.stages || []).map((s, i) => ({
        label: d.funnel?.stageDefinitions?.[i]?.label || s.key,
        value: s.value,
        rateFromPrev: s.stageConversionRate,
      }));
      if (d.funnel?.error) dataErrors.push(`Funnel: ${d.funnel.error}`);

      const attentionRules = (d.attention?.rules || []).map((r) => ({ label: r.label, count: r.count, valueAtRisk: round(r.valueAtRisk) }));

      const perfRow = (p) => ({ alias: book.alias("E", p.id, p.name), section: p.section, band: p.band, score: p.score });
      const performers = { top: (d.performers?.top || []).map(perfRow), bottom: (d.performers?.bottom || []).map(perfRow) };

      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" },
        branch: scope.branch || "All",
        revenue: {
          current: round(revenue.current), previous: round(revenue.previous),
          changePct: pct(revenue.current - revenue.previous, revenue.previous),
          byBranch: (revenue.byBranch || []).map((b) => ({ branch: b.branch, revenue: round(b.revenue) })),
          perDayTrend,
        },
        surgeries: { current: d.surgeries?.current || 0, previous: d.surgeries?.previous || 0, byBranch: surgeriesByBranch },
        funnel: { stages: funnelStages },
        attention: { totalFlagged: d.attention?.totalFlagged || 0, valueAtRisk: round(d.attention?.totalValueAtRisk), rules: attentionRules },
        performers,
        receivable: { totalPending: round(rec?.overall?.totalPending), count: rec?.overall?.count || 0 },
        payable: { totalPending: round(pay?.overall?.totalPending), count: pay?.overall?.count || 0 },
        dataErrors,
      });
      return { facts, rowsAnalyzed: performers.top.length + performers.bottom.length };
    },
  },
};

export default dashboardFeatures;
