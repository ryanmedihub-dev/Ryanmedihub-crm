import { NextResponse } from "next/server";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { getCallStats } from "@/lib/owner/metrics/leadsCalls";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

// /owner/calls section landing — total calls, connected, connect rate, unique
// numbers, trend. Numbers come from src/lib/owner/metrics/leadsCalls.js
// (shared with Sanya's get_call_stats tool).
export const GET = withCallbyRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);
  const data = await getCallStats({ dateFrom, dateTo });
  return NextResponse.json({ success: true, ...data });
});
