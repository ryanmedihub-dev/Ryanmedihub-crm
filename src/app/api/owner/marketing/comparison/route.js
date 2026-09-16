import { NextResponse } from "next/server";
import { istDayBucket } from "@/lib/owner/dates";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import AdSpend from "@/models/AdSpend";
import { attributeSpendToOutcomes } from "@/lib/owner/marketingAttribution";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];
const PLATFORMS = ["Meta", "Google"];

// /owner/marketing/comparison — Meta vs Google, side by side, for the period.
// Branch breakdown is spend-only: Leads (src/models/Leads.js) has no branch
// field, so leads/converted/revenue can never be scoped to a branch — same
// honest limitation the pre-existing marketing-summary note already states.
// Trend is a real per-day SPEND line (the only thing that's actually daily —
// conversions/revenue trickle in on their own schedule, see the attribution
// window in marketingAttribution.js) plus a period-over-period comparison
// (this period vs the immediately preceding, equal-length period) so
// "improving or decaying" is answered without a misleading daily ROAS line.
//
// "Connect rate for platform-sourced leads" was asked for but is not built:
// there is no callby endpoint that looks up calls by a list of phone numbers,
// and building one is disproportionate to a hedge-worded ("if derivable")
// ask — omitted, not faked.
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, branch } = parseEmployeeFilters(searchParams);
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ success: false, message: "dateFrom and dateTo are required" }, { status: 400 });
    }
    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    const periodMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - periodMs);

    const [current, previous] = await Promise.all([
      attributeSpendToOutcomes({ platforms: PLATFORMS, branch, from, to }),
      attributeSpendToOutcomes({ platforms: PLATFORMS, branch, from: prevFrom, to: prevTo }),
    ]);

    const branchMatch = { platform: { $in: PLATFORMS }, date: { $gte: from, $lte: to } };
    if (branch && branch !== "All") branchMatch.branch = branch;

    const [byBranch, daily] = await Promise.all([
      AdSpend.aggregate([
        { $match: branchMatch },
        { $group: { _id: { branch: "$branch", platform: "$platform" }, spend: { $sum: "$amount" } } },
      ]),
      AdSpend.aggregate([
        { $match: branchMatch },
        {
          $group: {
            _id: { date: istDayBucket("$date"), platform: "$platform" },
            spend: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]),
    ]);

    const branchRows = {};
    for (const r of byBranch) {
      const b = r._id.branch;
      branchRows[b] ||= { branch: b, Meta: 0, Google: 0 };
      branchRows[b][r._id.platform] = r.spend;
    }

    const dailyByDate = {};
    for (const r of daily) {
      const date = r._id.date;
      dailyByDate[date] ||= { date, Meta: 0, Google: 0 };
      dailyByDate[date][r._id.platform] = r.spend;
    }

    return NextResponse.json({
      success: true,
      current: current.byPlatform,
      previous: previous.byPlatform,
      previousWindow: { from: prevFrom, to: prevTo },
      byBranch: Object.values(branchRows).sort((a, b) => (b.Meta + b.Google) - (a.Meta + a.Google)),
      daily: Object.values(dailyByDate),
      note: "Leads/Converted/Revenue cannot be scoped by branch — the Leads collection has no branch field. Branch breakdown below is spend only.",
    });
  } catch (err) {
    console.error("owner marketing comparison error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
