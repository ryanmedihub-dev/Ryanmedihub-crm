import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";

const ALLOWED_ROLES = ["admin", "super-admin", "owner"];

/**
 * Gross sales booked in the period — every revenue transaction (Transplant + Service +
 * Medicine), cash and credit alike. This is the "what did we sell" number; it is NOT the
 * accrual P&L Income (which also folds in receivables raised and nets out double-counting),
 * and it is deliberately NOT account-scoped.
 */
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const branch = searchParams.get("branch") || "";

    const match = {
      costType: "Revenue",
      approvalStatus: { $nin: ["PENDING", "REJECTED"] },
    };
    if (branch) match.branch = branch;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }

    const rows = await Transactions.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$transactionCategory", "OTHER"] },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const round2 = (n) => Math.round((n || 0) * 100) / 100;
    const byCategory = { TRANSPLANT: 0, SERVICE: 0, MEDICINE: 0, OTHER: 0 };
    let total = 0;
    let count = 0;
    for (const r of rows) {
      const key = byCategory[r._id] !== undefined ? r._id : "OTHER";
      byCategory[key] = round2(byCategory[key] + (r.total || 0));
      total += r.total || 0;
      count += r.count || 0;
    }

    return NextResponse.json({
      success: true,
      total: round2(total),
      count,
      byCategory,
    });
  } catch (error) {
    console.error("Error computing sales summary:", error);
    return NextResponse.json({ error: "Failed to compute sales summary" }, { status: 500 });
  }
}
