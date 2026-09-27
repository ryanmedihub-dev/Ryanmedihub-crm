import { fetchCallbyCached } from "@/lib/callby";
import { toCallDateParams } from "@/lib/owner/callbyRoute";
import { toISTDateKey } from "@/lib/owner/dates";

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

export async function getCallStats({ dateFrom = "", dateTo = "" } = {}) {
  const params = dateFrom || dateTo
    ? { range: "custom", startDate: toISTDateKey(dateFrom || dateTo), endDate: toISTDateKey(dateTo || dateFrom) }
    : { range: "today" };
  const result = await fetchCallbyCached("/api/calls/stats", { params });
  const d = result?.data || {};
  
  
  const selected = d.selected || null;
  return {
    selected,
    today: d.today || null,
    callsPerHour: selected?.callsPerHour || d.callsPerHour || [],
    topDialers: selected?.topDialers || d.topDialers || [],
  };
}
