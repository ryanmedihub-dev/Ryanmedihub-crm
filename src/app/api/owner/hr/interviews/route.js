import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Interviewer from "@/models/Interviewer";
import { parseEmployeeFilters, parsePageParams } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

const SORT_FIELD_MAP = {
  date: "date",
  name: "name",
  position: "position",
  expectedSalary: "expectedSalary",
  finalSalary: "finalSalary",
  communication: "communication",
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// /owner/hr/interviews — the full interview report. One $facet: page of rows
// + totals for the whole filtered set (headcount by outcome).
export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, search, sortBy, sortDir } = parseEmployeeFilters(searchParams);
    const { page, pageSize, skip, limit } = parsePageParams(searchParams);

    const match = {};
    if (dateFrom || dateTo) {
      match.date = {};
      if (dateFrom) match.date.$gte = new Date(dateFrom);
      if (dateTo) match.date.$lte = new Date(dateTo);
    }
    const position = searchParams.get("position");
    const status = searchParams.get("status");
    const experienceType = searchParams.get("experienceType");
    const source = searchParams.get("source");
    const salaryMin = searchParams.get("salaryMin");
    const salaryMax = searchParams.get("salaryMax");
    if (position) match.position = position;
    if (status) match.status = status;
    if (experienceType) match.experienceType = experienceType;
    if (source) match.source = source;
    if (salaryMin || salaryMax) {
      match.expectedSalary = {};
      if (salaryMin) match.expectedSalary.$gte = Number(salaryMin);
      if (salaryMax) match.expectedSalary.$lte = Number(salaryMax);
    }
    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      match.$or = [{ name: re }, { phone: re }, { email: re }, { position: re }];
    }

    const sortField = SORT_FIELD_MAP[sortBy] || "date";
    const sortDirNum = sortDir === "asc" ? 1 : -1;

    const [result] = await Interviewer.aggregate([
      { $match: match },
      {
        $facet: {
          rows: [{ $sort: { [sortField]: sortDirNum, _id: 1 } }, { $skip: skip }, { $limit: limit }],
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
                onHold: { $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] } },
              },
            },
          ],
        },
      },
    ]);

    let rows = result.rows || [];
    if (rows.length) rows = await Interviewer.populate(rows, { path: "assignedHr", select: "name" });

    const totals = result.totals?.[0] || { count: 0, selected: 0, rejected: 0, onHold: 0 };

    return NextResponse.json({
      success: true,
      rows: rows.map((r) => ({ ...r, id: String(r._id) })),
      total: totals.count,
      page,
      pageSize,
      totals,
    });
  } catch (err) {
    console.error("owner hr interviews error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
