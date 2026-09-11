import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

// /owner/patients section landing — total patients, status funnel, revenue,
// conversion rate, branch split, daily trend. One $facet round trip.
//
// "Conversion rate" here is intentionally broader than the single Converted
// PAGE (which is SURGERY_BOOKED only, per the confirmed mapping) — it counts
// SURGERY_BOOKED + CLOSED (closed implies they were fully paid at some point
// too) against the total, so the landing KPI answers "what fraction of
// patients ever committed", not just "who's exactly at the SURGERY_BOOKED
// step right now".
const getHandler = async (req) => {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo, branch } = parseEmployeeFilters(searchParams);

  const match = {};
  if (branch && branch !== "All") match["personal.branch"] = branch;
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) match.createdAt.$lte = new Date(dateTo);
  }

  const [result] = await Patient.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              receivedSum: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
              converted: {
                $sum: { $cond: [{ $in: ["$ops.status", ["SURGERY_BOOKED", "CLOSED"]] }, 1, 0] },
              },
            },
          },
        ],
        statusBreakdown: [{ $group: { _id: "$ops.status", count: { $sum: 1 } } }],
        byBranch: [{ $group: { _id: { $ifNull: ["$personal.branch", "Unknown"] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        daywise: [
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const totalsRow = result.totals?.[0] || { count: 0, receivedSum: 0, converted: 0 };

  return NextResponse.json({
    success: true,
    total: totalsRow.count,
    receivedSum: totalsRow.receivedSum,
    conversionRate: totalsRow.count ? Math.round((totalsRow.converted / totalsRow.count) * 1000) / 10 : 0,
    statusBreakdown: (result.statusBreakdown || []).map((r) => ({ status: r._id, count: r.count })),
    byBranch: (result.byBranch || []).map((r) => ({ branch: r._id, count: r.count })),
    daywise: (result.daywise || []).map((r) => ({ date: r._id, value: r.count })),
  });
};

export const GET = withDB(getHandler);
