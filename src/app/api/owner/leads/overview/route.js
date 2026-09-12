import { NextResponse } from "next/server";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { getLeadFunnel } from "@/lib/owner/metrics/leadsCalls";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

// /owner/leads section landing — total leads, by status, by source, funnel,
// unattempted count, trend. Numbers come from src/lib/owner/metrics/leadsCalls.js
// (shared with Sanya's get_lead_funnel tool).
export const GET = withCallbyRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);
  const data = await getLeadFunnel({ dateFrom, dateTo });
  return NextResponse.json({ success: true, ...data });
});
