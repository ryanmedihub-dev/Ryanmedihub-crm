import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Transactions from "@/models/Transactions";
import AdSpend from "@/models/AdSpend";
import {
  parseEmployeeFilters, parsePageParams, parseSortParams, pagedFacet, unpackFacet, pageMeta,
} from "@/lib/owner/pagination";
import { expenseMatch } from "@/lib/transactionFilters";
import { periodBounds } from "@/lib/owner/dates";

const ALLOWED_ROLES = ["owner", "super-admin"];

// Reconciliation target: EXPENSE_CATEGORY_TREE.Marketing's "Meta ads"/"Google
// ads" sub-types (src/constants/expenseCategories.js) vs Part 4's AdSpend.
// These are entered in two different places and will drift — surfaced as a
// line, never hidden (Owner Panel v2, Part 5 brief).
const EXPENSE_TYPE_TO_PLATFORM = { "Meta ads": "Meta", "Google ads": "Google" };

// Rows are one per (category, sub-type) — bounded by the category tree today,
// but sorted/sliced in the database like every other list so the contract is
// uniform: page / pageSize (default 25, max 200) / sortBy / sortDir.
const SORTABLE = { total: "total", count: "count", category: "category", subType: "subType" };

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, branch, search } = parseEmployeeFilters(searchParams);
    const { page, pageSize, skip, limit } = parsePageParams(searchParams);
    const { sortBy, sortDir, sort } = parseSortParams(searchParams, {
      allowed: SORTABLE, defaultKey: "total", defaultDir: "desc", tiebreak: "subType",
    });

    // Same booked-money rules as the transactions KPI and P&L (approved only,
    // no settlements, no external methods) — one expense total, not three.
    const match = expenseMatch();
    if (branch && branch !== "All") match.branch = branch;
    const dateBounds = periodBounds(dateFrom, dateTo);
    if (dateBounds) match.date = dateBounds;

    const marketingTypes = Object.keys(EXPENSE_TYPE_TO_PLATFORM);
    const groupStages = [
      { $match: match },
      {
        $group: {
          _id: { category: { $ifNull: ["$expense", "Unspecified"] }, subType: { $ifNull: ["$expenseType", "Unspecified"] } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, category: "$_id.category", subType: "$_id.subType", total: 1, count: 1 } },
    ];
    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      groupStages.push({ $match: { $or: [{ category: re }, { subType: re }] } });
    }

    const adSpendMatch = { platform: { $in: ["Meta", "Google"] } };
    if (branch && branch !== "All") adSpendMatch.branch = branch;
    if (dateFrom || dateTo) {
      adSpendMatch.date = {};
      if (dateFrom) adSpendMatch.date.$gte = new Date(dateFrom);
      if (dateTo) adSpendMatch.date.$lte = new Date(dateTo);
    }

    const [result, adSpendAgg] = await Promise.all([
      Transactions.aggregate([
        ...groupStages,
        pagedFacet({
          sort, skip, limit,
          totals: [
            {
              $group: {
                _id: null,
                totalExpense: { $sum: "$total" },
                entries: { $sum: "$count" },
                marketingTxTotal: { $sum: { $cond: [{ $in: ["$subType", marketingTypes] }, "$total", 0] } },
              },
            },
          ],
        }),
      ]).collation({ locale: "en", strength: 2 }),
      // Same window, same branch scope, AdSpend side — no budget data exists
      // anywhere so this route never invents one; it only reconciles the two
      // numbers that already exist.
      AdSpend.aggregate([{ $match: adSpendMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]);

    const { rows, totals, total } = unpackFacet(result);
    const adSpendTotal = adSpendAgg?.[0]?.total || 0;
    const marketingTxTotal = totals?.marketingTxTotal || 0;

    return NextResponse.json({
      success: true,
      rows,
      total,
      ...pageMeta({ page, pageSize, total }),
      sortBy,
      sortDir,
      totalExpense: totals?.totalExpense || 0,
      entries: totals?.entries || 0,
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
