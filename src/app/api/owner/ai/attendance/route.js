import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import Attendance from "@/models/Attendance";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { fetchCallby, CallbyError } from "@/lib/callby";

// /owner/ai/attendance — call ACTIVITY per employee per day, plus whatever
// manual Attendance records already exist for that day, plus a SUGGESTED
// status computed from the activity. Nothing here is a claim about presence
// on its own — see Part 0 Blocking Decision #2 and src/models/Attendance.js.
// This is deliberately a single-day register (not a date-range grid): the
// thing an owner actually does with this page is "confirm today's status per
// employee," and a day-by-employee combination is small enough to render
// honestly, where a wide date range would invite treating gaps as absences.

// Suggestion rule — a starting point for a human, never final. Falls back to
// a plain present/absent split when an employee has no dailyTarget set,
// since attainment-based half-day math is meaningless without one.
function suggestStatus(totalCalls, targetAchievement) {
  if (totalCalls === 0) return "Absent";
  if (targetAchievement == null) return "Present";
  if (targetAchievement >= 50) return "Present";
  return "Half-day";
}

export const GET = withCallbyRoute(async (req) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const branch = searchParams.get("branch") || "All";
  const search = (searchParams.get("search") || "").trim();

  const empMatch = { isactive: true };
  if (branch !== "All") empMatch.branch = branch;
  if (search) empMatch.name = { $regex: search, $options: "i" };

  const employees = await Employee.find(empMatch)
    .select("name role branch tlName callbyUserId dailyTarget")
    .sort({ name: 1 })
    .lean();

  let activityByCallbyId = new Map();
  let callbyError = null;
  try {
    const result = await fetchCallby("/api/calls/daily-by-employee", {
      params: { startDate: date, endDate: date },
    });
    const records = result?.data?.records || [];
    activityByCallbyId = new Map(records.map((r) => [String(r.employeeId), r]));
  } catch (err) {
    callbyError = err instanceof CallbyError ? err.message : "Failed to load call activity";
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const existing = await Attendance.find({ date: dayStart, employeeId: { $in: employees.map((e) => e._id) } }).lean();
  const existingByEmp = new Map(existing.map((a) => [String(a.employeeId), a]));

  const rows = employees.map((e) => {
    const activity = e.callbyUserId ? activityByCallbyId.get(String(e.callbyUserId)) : null;
    const totalCalls = activity?.totalCalls || 0;
    const connectedCalls = activity?.connectedCalls || 0;
    const targetAchievement = activity?.targetAchievement ?? null;
    const suggested = e.callbyUserId ? suggestStatus(totalCalls, targetAchievement) : null;
    const marked = existingByEmp.get(String(e._id)) || null;

    return {
      id: String(e._id),
      employeeId: String(e._id),
      name: e.name,
      role: e.role,
      branch: e.branch,
      tlName: e.tlName || "",
      callbyLinked: !!e.callbyUserId,
      totalCalls,
      connectedCalls,
      activeWindowStart: activity?.firstCallAt || null,
      activeWindowEnd: activity?.lastCallAt || null,
      dailyTarget: activity?.dailyTarget || 0,
      targetAchievement,
      suggestedStatus: suggested,
      markedStatus: marked?.status || null,
      markedSource: marked?.source || null,
      markedBy: marked?.markedBy?.name || null,
      markedAt: marked?.markedAt || null,
      note: marked?.note || "",
    };
  });

  return NextResponse.json({
    success: true,
    date,
    rows,
    callbyError,
    summary: {
      total: rows.length,
      marked: rows.filter((r) => r.markedStatus).length,
      unmarked: rows.filter((r) => !r.markedStatus).length,
      noActivity: rows.filter((r) => r.callbyLinked && r.totalCalls === 0).length,
      unlinked: rows.filter((r) => !r.callbyLinked).length,
    },
  });
});

// POST — mark or override one employee's attendance for a day. Always a
// human action: `source` is "suggested" only when the caller clicked
// "confirm suggestion" (still a click, not an automatic write) and "manual"
// for any status the person chose themselves or typed over the suggestion.
export const POST = withCallbyRoute(async (req, session) => {
  await dbConnect();
  const body = await req.json();
  const records = Array.isArray(body?.records) ? body.records : [body];

  const results = [];
  for (const r of records) {
    const { employeeId, date, status, note, source } = r || {};
    if (!employeeId || !date || !status) {
      results.push({ employeeId, ok: false, message: "employeeId, date, and status are required" });
      continue;
    }
    const dayStart = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`);
    const doc = await Attendance.findOneAndUpdate(
      { employeeId, date: dayStart },
      {
        $set: {
          status,
          note: note || "",
          source: source === "suggested" ? "suggested" : "manual",
          markedBy: { name: session.user.name || session.user.email, email: session.user.email },
          markedAt: new Date(),
        },
        $setOnInsert: { employeeId, date: dayStart },
      },
      { upsert: true, new: true },
    ).lean();
    results.push({ employeeId, ok: true, status: doc.status });
  }

  return NextResponse.json({ success: true, results });
});
