import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Transactions from "@/models/Transactions";
import AdSpend from "@/models/AdSpend";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

// Reconciliation target: EXPENSE_CATEGORY_TREE.Marketing's "Meta ads"/"Google
// ads" sub-types (src/constants/expenseCategories.js) vs Part 4's AdSpend.
// These are entered in two different places and will drift — surfaced as a
// line, never hidden (Owner Panel v2, Part 5 brief).
const EXPENSE_TYPE_TO_PLATFORM = { "Meta ads": "Meta", "Google ads": "Google" };

export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, branch } = parseEmployeeFilters(searchParams);

    const match = { transactionCategory: "EXPENSE" };
    if (branch && branch !== "All") match.branch = branch;
    if (dateFrom || dateTo) {
      match.date = {};
      if (dateFrom) match.date.$gte = new Date(dateFrom);
      if (dateTo) match.date.$lte = new Date(dateTo);
    }

    const rows = await Transactions.aggregate([
      { $match: match },
      {
        $group: {
          _id: { category: { $ifNull: ["$expense", "Unspecified"] }, subType: { $ifNull: ["$expenseType", "Unspecified"] } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const marketingTypes = Object.keys(EXPENSE_TYPE_TO_PLATFORM);
    const marketingTxTotal = rows
      .filter((r) => marketingTypes.includes(r._id.subType))
      .reduce((s, r) => s + r.total, 0);

    // Same window, same branch scope, AdSpend side — no budget data exists
    // anywhere so this route never invents one; it only reconciles the two
    // numbers that already exist.
    const adSpendMatch = { platform: { $in: ["Meta", "Google"] } };
    if (branch && branch !== "All") adSpendMatch.branch = branch;
    if (dateFrom || dateTo) {
      adSpendMatch.date = {};
      if (dateFrom) adSpendMatch.date.$gte = new Date(dateFrom);
      if (dateTo) adSpendMatch.date.$lte = new Date(dateTo);
    }
    const [adSpendAgg] = await AdSpend.aggregate([
      { $match: adSpendMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const adSpendTotal = adSpendAgg?.total || 0;

    return NextResponse.json({
      success: true,
      rows: rows.map((r) => ({ category: r._id.category, subType: r._id.subType, total: r.total, count: r.count })),
      totalExpense: rows.reduce((s, r) => s + r.total, 0),
      marketingReconciliation: {
        transactionsTotal: marketingTxTotal,
        adSpendTotal,
        delta: marketingTxTotal - adSpendTotal,
      },
      note: "No budget data exists anywhere in the app — no budget-vs-actual column is shown; this is actuals only.",
    });
  } catch (err) {
    console.error("owner finance expenses error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
