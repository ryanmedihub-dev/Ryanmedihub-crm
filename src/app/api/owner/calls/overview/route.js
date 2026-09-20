import { NextResponse } from "next/server";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { getCallStats } from "@/lib/owner/metrics/leadsCalls";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { cacheKey, cached } from "@/lib/cache";

// /owner/calls section landing — total calls, connected, connect rate, unique
// numbers, trend. Numbers come from src/lib/owner/metrics/leadsCalls.js
// (shared with Sanya's get_call_stats tool).
export const GET = withCallbyRoute(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);

  const meta = {};
  const key = cacheKey("owner", { route: "calls-overview", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const stats = await getCallStats({ dateFrom, dateTo });
    return { success: true, ...stats };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
});
