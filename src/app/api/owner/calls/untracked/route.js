import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute, toCallDateParams } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters, parsePageParams } from "@/lib/owner/pagination";
import { cacheKey, cached } from "@/lib/cache";

export const GET = withCallbyRoute(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo, search } = parseEmployeeFilters(searchParams);
  const { page, pageSize } = parsePageParams(searchParams);

  const meta = {};
  const key = cacheKey("owner", { route: "calls-untracked", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const baseParams = { ...toCallDateParams(dateFrom, dateTo) };
    const tlName = searchParams.get("tlName");
    const employeeId = searchParams.get("employeeId");
    if (tlName) baseParams.tlName = tlName;
    if (employeeId) baseParams.employeeId = employeeId;
    if (search) baseParams.search = search;

    const [untrackedResult, allResult] = await Promise.all([
      fetchCallby("/api/calls", { params: { ...baseParams, unsynced: "true", page: String(page), limit: String(pageSize) } }),
      fetchCallby("/api/calls", { params: { ...baseParams, page: "1", limit: "1" } }),
    ]);

    const untracked = untrackedResult?.data || {};
    const totalCalls = allResult?.data?.total || 0;
    const untrackedTotal = untracked.total || 0;

    return {
      success: true,
      rows: untracked.calls || [],
      total: untrackedTotal,
      page: untracked.page || page,
      pages: untracked.pages || 1,
      totalCalls,
      untrackedPct: totalCalls > 0 ? Math.round((untrackedTotal / totalCalls) * 1000) / 10 : 0,
    };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
});
