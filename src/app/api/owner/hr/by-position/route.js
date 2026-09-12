import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Interviewer from "@/models/Interviewer";
import {
  parseEmployeeFilters, parsePageParams, parseSortParams, pagedFacet, unpackFacet, pageMeta,
} from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];
const DAY_MS = 86400000;

// /owner/hr/by-position — grouped by position: interviews, selected, rejected,
// hold, selection rate, avg expected vs final salary, avg time-to-fill (date ->
// updatedAt for Selected candidates only — "how long does filling this role take").
//
// `position` is free text on Interviewer, so the row count grows with every
// new spelling (135 today). Derived columns are computed in the pipeline so
// the database can sort on them; page/pageSize/sortBy/sortDir per
// src/lib/owner/pagination.js (default 25, max 200).
const SORTABLE = {
  position: "position", interviews: "interviews", selected: "selected", rejected: "rejected", onHold: "onHold",
  selectionRate: "selectionRate", avgExpectedSalary: "avgExpectedSalary", avgFinalSalary: "avgFinalSalary",
  avgDaysToFill: "avgDaysToFill",
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, search } = parseEmployeeFilters(searchParams);
    const { page, pageSize, skip, limit } = parsePageParams(searchParams);
    const { sortBy, sortDir, sort } = parseSortParams(searchParams, {
      allowed: SORTABLE, defaultKey: "interviews", defaultDir: "desc", tiebreak: "position",
    });

    const match = {};
    if (dateFrom || dateTo) {
      match.date = {};
      if (dateFrom) match.date.$gte = new Date(dateFrom);
      if (dateTo) match.date.$lte = new Date(dateTo);
    }

    const stages = [
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$position", "Unspecified"] },
          interviews: { $sum: 1 },
          selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
          onHold: { $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] } },
          avgExpectedSalary: { $avg: "$expectedSalary" },
          avgFinalSalary: { $avg: { $cond: [{ $eq: ["$status", "Selected"] }, "$finalSalary", null] } },
          fillDaysSum: {
            $sum: {
              $cond: [{ $eq: ["$status", "Selected"] }, { $divide: [{ $subtract: ["$updatedAt", "$date"] }, DAY_MS] }, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          position: "$_id",
          interviews: 1, selected: 1, rejected: 1, onHold: 1,
          selectionRate: {
            $cond: [{ $gt: ["$interviews", 0] }, { $round: [{ $multiply: [{ $divide: ["$selected", "$interviews"] }, 100] }, 1] }, 0],
          },
          avgExpectedSalary: { $round: [{ $ifNull: ["$avgExpectedSalary", 0] }, 0] },
          avgFinalSalary: { $cond: [{ $gt: ["$selected", 0] }, { $round: [{ $ifNull: ["$avgFinalSalary", 0] }, 0] }, null] },
          avgDaysToFill: { $cond: [{ $gt: ["$selected", 0] }, { $round: [{ $divide: ["$fillDaysSum", "$selected"] }, 1] }, null] },
        },
      },
    ];
    if (search) stages.push({ $match: { position: new RegExp(escapeRegex(search), "i") } });

    const result = await Interviewer.aggregate([
      ...stages,
      pagedFacet({
        sort, skip, limit,
        totals: [
          {
            $group: {
              _id: null,
              positions: { $sum: 1 },
              interviews: { $sum: "$interviews" },
              selected: { $sum: "$selected" },
              rejected: { $sum: "$rejected" },
              onHold: { $sum: "$onHold" },
            },
          },
        ],
      }),
    ]).collation({ locale: "en", strength: 2 });

    const { rows, totals, total } = unpackFacet(result);

    return NextResponse.json({
      success: true,
      rows,
      total,
      ...pageMeta({ page, pageSize, total }),
      sortBy,
      sortDir,
      summary: {
        positions: totals?.positions || 0,
        interviews: totals?.interviews || 0,
        selected: totals?.selected || 0,
        rejected: totals?.rejected || 0,
        onHold: totals?.onHold || 0,
      },
    });
  } catch (err) {
    console.error("owner hr by-position error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
