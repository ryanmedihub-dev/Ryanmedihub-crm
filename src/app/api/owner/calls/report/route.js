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
  const key = cacheKey("owner", { route: "calls-report", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const params = {
      ...toCallDateParams(dateFrom, dateTo),
      tab: "callHistory",
      page: String(page),
      limit: String(pageSize),
    };
    const employeeId = searchParams.get("employeeId");
    const tlName = searchParams.get("tlName");
    const callType = searchParams.get("callType");
    const duration = searchParams.get("duration"); 
    const connectedOnly = searchParams.get("connectedOnly");
    const source = searchParams.get("source");
    if (employeeId) params.employeeId = employeeId;
    if (tlName) params.tlName = tlName;
    if (callType) params.callType = callType;
    if (duration) params.duration = duration;
    if (connectedOnly === "true") params.connectedOnly = "true";
    if (source) params.source = source;
    if (search) params.search = search;

    const result = await fetchCallby("/api/reports/periodic", { params });
    const d = result?.data || {};

    return {
      success: true,
      rows: d.calls || [],
      total: d.total || 0,
      page: d.page || page,
      pages: d.pages || 1,
    };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
});
