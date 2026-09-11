import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

// /owner/calls section landing — total calls, connected, connect rate, unique
// numbers, trend. Backed entirely by callby's own GET /api/calls/stats (no new
// callby endpoint needed — see the Part 2 plan's audit).
export const GET = withCallbyRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);

  const params = dateFrom || dateTo
    ? { range: "custom", startDate: (dateFrom || dateTo).slice(0, 10), endDate: (dateTo || dateFrom).slice(0, 10) }
    : { range: "today" };

  const result = await fetchCallby("/api/calls/stats", { params });
  const d = result?.data || {};

  return NextResponse.json({
    success: true,
    selected: d.selected || null,
    today: d.today || null,
    callsPerHour: d.callsPerHour || d.selected?.callsPerHour || [],
    topDialers: d.topDialers || [],
  });
});
