import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { toISTDateKey, daysInPeriod } from "@/lib/owner/dates";
import { cacheKey, cached } from "@/lib/cache";

export const GET = withCallbyRoute(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);

  const meta = {};
  const key = cacheKey("owner", { route: "calls-employee-report", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const params = dateFrom || dateTo
      ? { range: "custom", startDate: toISTDateKey(dateFrom || dateTo), endDate: toISTDateKey(dateTo || dateFrom) }
      : { range: "today" };

    const result = await fetchCallby("/api/calls/stats", { params });
    const selected = result?.data?.selected || {};

    
    
    const periodDays = dateFrom || dateTo ? daysInPeriod(dateFrom || dateTo, dateTo || dateFrom) : 1;

    const rows = (selected.employeeStats || []).map((e) => {
      const totalCalls = e.count || 0;
      const dailyTarget = e.dailyTarget || 0;
      const periodTarget = dailyTarget * periodDays;
      return {
        employeeId: e.employeeId,
        name: e.name,
        tlName: e.tlName || "",
        totalCalls,
        connectedCalls: e.connectedCalls || 0,
        connectRate: e.connRate || 0,
        dailyTarget,
        periodDays,
        targetAttainment: periodTarget ? Math.round((totalCalls / periodTarget) * 100) : null,
        firstCallAt: e.firstCallAt || null,
        lastCallAt: e.lastCallAt || null,
      };
    });

    return { success: true, rows, dateLabel: selected.date || null };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
});
