import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute, toCallDateParams } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

// /owner/leads section landing — total leads, by status, by source, funnel,
// unattempted count, trend. Backed by callby's GET /api/reports/leads-periodic
// (summary/sources/dayWise tabs) — no new callby endpoint needed.
export const GET = withCallbyRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);
  const dateParams = toCallDateParams(dateFrom, dateTo);

  const [summaryResult, sourcesResult, dayWiseResult] = await Promise.all([
    fetchCallby("/api/reports/leads-periodic", { params: { ...dateParams, tab: "summary" } }),
    fetchCallby("/api/reports/leads-periodic", { params: { ...dateParams, tab: "sources" } }),
    fetchCallby("/api/reports/leads-periodic", { params: { ...dateParams, tab: "dayWise" } }),
  ]);

  return NextResponse.json({
    success: true,
    summary: summaryResult?.data?.summary || {},
    pieData: summaryResult?.data?.pieData || [],
    sidebarStats: summaryResult?.data?.sidebarStats || {},
    sources: sourcesResult?.data?.records || [],
    daywise: dayWiseResult?.data?.daywise || [],
  });
});
