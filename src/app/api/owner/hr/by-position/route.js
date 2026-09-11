import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Interviewer from "@/models/Interviewer";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];
const DAY_MS = 86400000;

// /owner/hr/by-position — grouped by position: interviews, selected, rejected,
// hold, selection rate, avg expected vs final salary, avg time-to-fill (date ->
// updatedAt for Selected candidates only — "how long does filling this role take").
export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);

    const match = {};
    if (dateFrom || dateTo) {
      match.date = {};
      if (dateFrom) match.date.$gte = new Date(dateFrom);
      if (dateTo) match.date.$lte = new Date(dateTo);
    }

    const rows = await Interviewer.aggregate([
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
      { $sort: { interviews: -1 } },
    ]);

    return NextResponse.json({
      success: true,
      rows: rows.map((r) => ({
        position: r._id,
        interviews: r.interviews,
        selected: r.selected,
        rejected: r.rejected,
        onHold: r.onHold,
        selectionRate: r.interviews ? Math.round((r.selected / r.interviews) * 1000) / 10 : 0,
        avgExpectedSalary: Math.round(r.avgExpectedSalary || 0),
        avgFinalSalary: r.selected ? Math.round(r.avgFinalSalary || 0) : null,
        avgDaysToFill: r.selected ? Math.round((r.fillDaysSum / r.selected) * 10) / 10 : null,
      })),
    });
  } catch (err) {
    console.error("owner hr by-position error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
