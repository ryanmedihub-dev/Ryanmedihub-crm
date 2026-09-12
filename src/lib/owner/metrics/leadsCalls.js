import { fetchCallbyCached } from "@/lib/callby";
import { toCallDateParams } from "@/lib/owner/callbyRoute";

// One implementation of the Leads and Calls landing numbers (callby-backed).
// /api/owner/leads/overview, /api/owner/calls/overview and Sanya's
// `get_lead_funnel` / `get_call_stats` tools all call these. Cached briefly
// (fetchCallbyCached) — a landing page and a chat turn asking the same
// question within a minute share one callby round trip.

/**
 * Lead funnel for a period: summary counts, status split, sources, day-wise.
 * Backed by callby's GET /api/reports/leads-periodic (summary/sources/dayWise
 * tabs) — no new callby endpoint needed.
 */
export async function getLeadFunnel({ dateFrom = "", dateTo = "" } = {}) {
  const dateParams = toCallDateParams(dateFrom, dateTo);
  const [summaryResult, sourcesResult, dayWiseResult] = await Promise.all([
    fetchCallbyCached("/api/reports/leads-periodic", { params: { ...dateParams, tab: "summary" } }),
    fetchCallbyCached("/api/reports/leads-periodic", { params: { ...dateParams, tab: "sources" } }),
    fetchCallbyCached("/api/reports/leads-periodic", { params: { ...dateParams, tab: "dayWise" } }),
  ]);
  return {
    summary: summaryResult?.data?.summary || {},
    pieData: summaryResult?.data?.pieData || [],
    sidebarStats: summaryResult?.data?.sidebarStats || {},
    sources: sourcesResult?.data?.records || [],
    daywise: dayWiseResult?.data?.daywise || [],
  };
}

/**
 * Call volume for a period: totals, connect rate, per-hour curve, top dialers.
 * Backed entirely by callby's GET /api/calls/stats.
 */
export async function getCallStats({ dateFrom = "", dateTo = "" } = {}) {
  const params = dateFrom || dateTo
    ? { range: "custom", startDate: (dateFrom || dateTo).slice(0, 10), endDate: (dateTo || dateFrom).slice(0, 10) }
    : { range: "today" };
  const result = await fetchCallbyCached("/api/calls/stats", { params });
  const d = result?.data || {};
  return {
    selected: d.selected || null,
    today: d.today || null,
    callsPerHour: d.callsPerHour || d.selected?.callsPerHour || [],
    topDialers: d.topDialers || [],
  };
}
