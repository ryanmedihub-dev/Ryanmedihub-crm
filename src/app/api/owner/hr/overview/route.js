import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Interviewer from "@/models/Interviewer";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];
const DAY_MS = 86400000;

// /owner/hr section landing — interviews/selected/rejected/hold/selectionRate/
// avg time-to-decision/position demand/trend, one $facet round trip.
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

    const [result] = await Interviewer.aggregate([
      { $match: match },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
                onHold: { $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] } },
                // Time-to-decision: date -> updatedAt, only for interviews that have left
                // "Applied" (i.e. an actual decision has been recorded).
                decidedCount: { $sum: { $cond: [{ $ne: ["$status", "Applied"] }, 1, 0] } },
                decisionDaysSum: {
                  $sum: {
                    $cond: [
                      { $ne: ["$status", "Applied"] },
                      { $divide: [{ $subtract: ["$updatedAt", "$date"] }, DAY_MS] },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          byPosition: [
            { $group: { _id: "$position", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
          ],
          daywise: [
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const t = result.totals?.[0] || { count: 0, selected: 0, rejected: 0, onHold: 0, decidedCount: 0, decisionDaysSum: 0 };

    return NextResponse.json({
      success: true,
      total: t.count,
      selected: t.selected,
      rejected: t.rejected,
      onHold: t.onHold,
      selectionRate: t.count ? Math.round((t.selected / t.count) * 1000) / 10 : 0,
      avgDaysToDecision: t.decidedCount ? Math.round((t.decisionDaysSum / t.decidedCount) * 10) / 10 : null,
      byPosition: (result.byPosition || []).map((p) => ({ position: p._id || "Unspecified", count: p.count })),
      daywise: (result.daywise || []).map((d) => ({ date: d._id, value: d.count })),
    });
  } catch (err) {
    console.error("owner hr overview error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
