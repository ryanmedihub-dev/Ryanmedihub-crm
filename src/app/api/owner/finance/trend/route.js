import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { getFinanceTrend } from "@/lib/owner/metrics/finance";

const ALLOWED_ROLES = ["admin", "super-admin", "owner"];

// Daily receipts/payments for the /owner/finance landing trend chart. Numbers
// come from src/lib/owner/metrics/finance.js (shared with Sanya). Reuses
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

    const { daily } = await getFinanceTrend({ from, to, branch });

    return NextResponse.json({ success: true, daily });
  } catch (err) {
    console.error("owner finance trend error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
