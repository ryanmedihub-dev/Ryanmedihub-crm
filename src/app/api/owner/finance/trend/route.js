import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Transactions from "@/models/Transactions";
import { accountsSync } from "@/lib/masterData";
import { buildBalanceMatch } from "@/lib/accountBalances";

const ALLOWED_ROLES = ["admin", "super-admin", "owner"];

// Daily receipts/payments for the /owner/finance landing trend chart. Reuses
// the EXACT match filter close-book's cash-flow route uses
// (buildBalanceMatch) — same definition, just grouped by day — so this trend
// sums to the same receipts/payments the landing page's existing KPI row
// already shows. Deliberately NOT a P&L trend: /api/close-book/pnl's accrual
// logic (direct transactions + receivables/payables raised) is nontrivial and
// re-deriving it per day risked a second, disagreeing number — cash-basis is
// what's shown here, labelled as such.
export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const branch = searchParams.get("branch") || "";

    const match = buildBalanceMatch({ accounts: accountsSync(), from, to, branch });

    const rows = await Transactions.aggregate([
      { $match: match },
      {
        $group: {
          _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, costType: "$costType" },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    const byDate = {};
    for (const r of rows) {
      const date = r._id.date;
      byDate[date] ||= { date, receipts: 0, payments: 0 };
      if (r._id.costType === "Revenue") byDate[date].receipts = r.total;
      else if (r._id.costType === "Expenses") byDate[date].payments = r.total;
    }

    return NextResponse.json({ success: true, daily: Object.values(byDate) });
  } catch (err) {
    console.error("owner finance trend error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
