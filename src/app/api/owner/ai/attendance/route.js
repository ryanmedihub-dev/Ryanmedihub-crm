import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import Attendance from "@/models/Attendance";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { fetchCallbyCached, CallbyError } from "@/lib/callby";
import { parsePageParams, parseSortParams, pagedFacet, unpackFacet, pageMeta } from "@/lib/owner/pagination";

// /owner/ai/attendance — call ACTIVITY per employee per day, plus whatever
// manual Attendance records already exist for that day, plus a SUGGESTED
// status computed from the activity. Nothing here is a claim about presence
// on its own — see Part 0 Blocking Decision #2 and src/models/Attendance.js.
// This is deliberately a single-day register (not a date-range grid): the
// thing an owner actually does with this page is "confirm today's status per
// employee," and a day-by-employee combination is small enough to render
// honestly, where a wide date range would invite treating gaps as absences.
//
// One Employee.aggregate(): $lookup the day's Attendance rows, attach the
// day's callby activity (one cached call, keyed by callbyUserId), derive the
// suggestion in the pipeline, then $facet the sorted page + the summary counts
// over the whole register. page/pageSize/sortBy/sortDir per
// src/lib/owner/pagination.js (default 25, max 200).

// Suggestion rule — a starting point for a human, never final. Falls back to
// a plain present/absent split when an employee has no dailyTarget set,
// since attainment-based half-day math is meaningless without one.
// (Mongo expression; the rule is documented here and nowhere else.)
const SUGGESTED_STATUS_EXPR = {
  $cond: [
    { $eq: ["$callbyLinked", false] },
    null,
    {
      $switch: {
        branches: [
          { case: { $eq: ["$totalCalls", 0] }, then: "Absent" },
          { case: { $eq: ["$targetAchievement", null] }, then: "Present" },
          { case: { $gte: ["$targetAchievement", 50] }, then: "Present" },
        ],
        default: "Half-day",
      },
    },
  ],
};

const SORTABLE = {
  name: "name", branch: "branch", role: "role", totalCalls: "totalCalls", connectedCalls: "connectedCalls",
  targetAchievement: "targetAchievement", suggestedStatus: "suggestedStatus", markedStatus: "markedStatus",
  activeWindowStart: "activeWindowStart",
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const GET = withCallbyRoute(async (req) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const branch = searchParams.get("branch") || "All";
  const search = (searchParams.get("search") || "").trim();
  const { page, pageSize, skip, limit } = parsePageParams(searchParams);
  const { sortBy, sortDir, sort } = parseSortParams(searchParams, { allowed: SORTABLE, defaultKey: "name" });

  const empMatch = { isactive: true, mergedInto: null };
  if (branch !== "All") empMatch.branch = branch;
  if (search) empMatch.name = { $regex: escapeRegex(search), $options: "i" };

  // The day's call activity from callby — one call for the whole register,
  // cached briefly so paging through it doesn't re-fetch.
  let activity = [];
  let callbyError = null;
  try {
    const result = await fetchCallbyCached("/api/calls/daily-by-employee", {
      params: { startDate: date, endDate: date },
    });
    activity = (result?.data?.records || []).map((r) => ({
      id: String(r.employeeId),
      totalCalls: r.totalCalls || 0,
      connectedCalls: r.connectedCalls || 0,
      targetAchievement: r.targetAchievement ?? null,
      firstCallAt: r.firstCallAt || null,
      lastCallAt: r.lastCallAt || null,
      dailyTarget: r.dailyTarget || 0,
    }));
  } catch (err) {
    callbyError = err instanceof CallbyError ? err.message : "Failed to load call activity";
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);

  const result = await Employee.aggregate([
    { $match: empMatch },
    {
      $lookup: {
        from: Attendance.collection.name,
        let: { eid: "$_id" },
        pipeline: [
          { $match: { date: dayStart, $expr: { $eq: ["$employeeId", "$$eid"] } } },
          { $limit: 1 },
          { $project: { status: 1, source: 1, note: 1, markedAt: 1, "markedBy.name": 1 } },
        ],
        as: "_marked",
      },
    },
    {
      $addFields: {
        _marked: { $arrayElemAt: ["$_marked", 0] },
        callbyLinked: { $gt: [{ $strLenCP: { $ifNull: ["$callbyUserId", ""] } }, 0] },
        _act: {
          $arrayElemAt: [
            { $filter: { input: { $literal: activity }, as: "a", cond: { $eq: ["$$a.id", { $ifNull: ["$callbyUserId", ""] }] } } },
            0,
          ],
        },
      },
    },
    {
      $addFields: {
        totalCalls: { $ifNull: ["$_act.totalCalls", 0] },
        connectedCalls: { $ifNull: ["$_act.connectedCalls", 0] },
        targetAchievement: { $ifNull: ["$_act.targetAchievement", null] },
        activeWindowStart: { $ifNull: ["$_act.firstCallAt", null] },
        activeWindowEnd: { $ifNull: ["$_act.lastCallAt", null] },
        dailyTarget: { $ifNull: ["$_act.dailyTarget", 0] },
        markedStatus: { $ifNull: ["$_marked.status", null] },
        markedSource: { $ifNull: ["$_marked.source", null] },
        markedBy: { $ifNull: ["$_marked.markedBy.name", null] },
        markedAt: { $ifNull: ["$_marked.markedAt", null] },
        note: { $ifNull: ["$_marked.note", ""] },
      },
    },
    { $addFields: { suggestedStatus: SUGGESTED_STATUS_EXPR } },
    pagedFacet({
      sort, skip, limit,
      rowStages: [
        {
          $project: {
            name: 1, role: 1, branch: 1, tlName: { $ifNull: ["$tlName", ""] }, callbyLinked: 1,
            totalCalls: 1, connectedCalls: 1, activeWindowStart: 1, activeWindowEnd: 1, dailyTarget: 1,
            targetAchievement: 1, suggestedStatus: 1, markedStatus: 1, markedSource: 1, markedBy: 1, markedAt: 1, note: 1,
          },
        },
      ],
      totals: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            marked: { $sum: { $cond: [{ $ne: ["$markedStatus", null] }, 1, 0] } },
            noActivity: { $sum: { $cond: [{ $and: ["$callbyLinked", { $eq: ["$totalCalls", 0] }] }, 1, 0] } },
            unlinked: { $sum: { $cond: ["$callbyLinked", 0, 1] } },
          },
        },
      ],
    }),
  ]).collation({ locale: "en", strength: 2 });

  const { rows: pageRows, totals, total } = unpackFacet(result);
  const rows = pageRows.map(({ _id, ...r }) => ({ id: String(_id), employeeId: String(_id), ...r }));

  return NextResponse.json({
    success: true,
    date,
    rows,
    total,
    ...pageMeta({ page, pageSize, total }),
    sortBy,
    sortDir,
    callbyError,
    summary: {
      total: totals?.total || 0,
      marked: totals?.marked || 0,
      unmarked: (totals?.total || 0) - (totals?.marked || 0),
      noActivity: totals?.noActivity || 0,
      unlinked: totals?.unlinked || 0,
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
