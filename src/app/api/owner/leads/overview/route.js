import { NextResponse } from "next/server";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { getLeadFunnel } from "@/lib/owner/metrics/leadsCalls";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { cacheKey, cached } from "@/lib/cache";

export const GET = withCallbyRoute(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);

  const meta = {};
  const key = cacheKey("owner", { route: "leads-overview", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const funnel = await getLeadFunnel({ dateFrom, dateTo });
    return { success: true, ...funnel };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
});
