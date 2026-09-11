import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute, toLeadDateParams } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters, parsePageParams } from "@/lib/owner/pagination";

// /owner/leads/report — the full lead report, mirroring callby's own
// /reports/lead page columns. Backed by callby's GET /api/leads (now with
// Part 2's tlName/source/attempts additions), paginated in callby's Mongo query.
export const GET = withCallbyRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo, search } = parseEmployeeFilters(searchParams);
  const { page, pageSize } = parsePageParams(searchParams);

  const params = {
    ...toLeadDateParams(dateFrom, dateTo),
    page: String(page),
    limit: String(pageSize),
  };
  const status = searchParams.get("status");
  const assignedTo = searchParams.get("assignedTo");
  const tlName = searchParams.get("tlName");
  const source = searchParams.get("source");
  const attemptsMin = searchParams.get("attemptsMin");
  const attemptsMax = searchParams.get("attemptsMax");
  if (status) params.status = status;
  if (assignedTo) params.assignedTo = assignedTo;
  if (tlName) params.tlName = tlName;
  if (source) params.source = source;
  if (attemptsMin) params.attemptsMin = attemptsMin;
  if (attemptsMax) params.attemptsMax = attemptsMax;
  if (search) params.search = search;

  const result = await fetchCallby("/api/leads", { params });
  const d = result?.data || {};

  return NextResponse.json({
    success: true,
    rows: d.leads || [],
    total: d.total || 0,
    page: d.page || page,
    pages: d.pages || 1,
  });
});
