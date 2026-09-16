import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { toISTDateKey, daysInPeriod } from "@/lib/owner/dates";

// /owner/calls/employee-report — per-employee call summary for the period:
// total calls, connected, connect rate, talk time, first/last call time
// ("active call window" — call ACTIVITY, not attendance, Part 0 Blocking
// Decision #2), and target attainment against each user's own dailyTarget
// (not a hardcoded 100/200 — see Part 0/1: the confirmed value is 100).
// Backed by callby's GET /api/calls/stats, which now (Part 2) exposes
// firstCallAt/lastCallAt per employee.
export const GET = withCallbyRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);

  const params = dateFrom || dateTo
    ? { range: "custom", startDate: toISTDateKey(dateFrom || dateTo), endDate: toISTDateKey(dateTo || dateFrom) }
    : { range: "today" };

  const result = await fetchCallby("/api/calls/stats", { params });
  const selected = result?.data?.selected || {};

  // callby's targetAchievement divides the whole period's calls by ONE day's
  // target, so a 7-day range reads ~700%. Re-derive it against the period.
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

  return NextResponse.json({ success: true, rows, dateLabel: selected.date || null });
});
