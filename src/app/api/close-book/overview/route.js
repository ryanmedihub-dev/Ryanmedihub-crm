import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import Advance from "@/models/Advance";
import SuspenseEntry from "@/models/SuspenseEntry";
import Transactions from "@/models/Transactions";
import { resolveBranchFilter } from "@/lib/branches";
import { getAccountRollup } from "@/lib/accountRollup";
import { buildPayableGroupedStages, buildPayableAggregationStages } from "@/lib/payableAggregation";
import { buildReceivableGroupedStages, buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { buildBalanceMatch } from "@/lib/accountBalances";
import { accountsSync } from "@/lib/masterData";
import { settledTotalExpr } from "@/lib/advanceSettlements";
import {
  RENT_PURPOSES,
  EMPLOYEE_PURPOSES,
  OTHER_PURPOSES,
  payableGroupForPurpose,
} from "@/constants/payableGroups";
import { cacheKey, cached } from "@/lib/cache";

export const revalidate = 0;

const ALLOWED_ROLES = ["admin", "super-admin"];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sumClosing = (rows) => round2((rows || []).reduce((s, r) => s + (r.closing || 0), 0));
const sumCount = (rows) => (rows || []).reduce((s, r) => s + (r.count || 0), 0);

// Advances OUT with something still to come back — remaining = amount − settled − cash recovered.
// Mirrors /api/advances/open-for-party's per-doc maths, both shapes of settlement folded in.
function advanceRemainingStages({ branch }) {
  return [
    { $match: { direction: "OUT", isCancelled: { $ne: true }, ...(branch ? { branch } : {}) } },
    {
      $lookup: {
        from: Advance.collection.name,
        let: { rid: "$receivableId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$receivableId", "$$rid"] },
                  { $eq: ["$direction", "IN"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          { $group: { _id: null, cash: { $sum: "$amount" } } },
        ],
        as: "recovered",
      },
    },
    {
      $addFields: {
        settledTotal: settledTotalExpr,
        cashRecovered: { $ifNull: [{ $arrayElemAt: ["$recovered.cash", 0] }, 0] },
      },
    },
    {
      $addFields: {
        remaining: {
          $max: [{ $subtract: ["$amount", { $add: ["$settledTotal", "$cashRecovered"] }] }, 0],
        },
      },
    },
    { $match: { remaining: { $gt: 0.005 } } },
  ];
}

async function assetsOverview({ branch, to }) {
  const txCollection = Transactions.collection.name;
  const liveMatch = { isCancelled: false, ...(branch ? { branch } : {}) };
  // The hero + section cards are "as of `to`" balances — opening is folded into closing, so
  // `from` is intentionally NOT applied here (matches the pre-split overview exactly). `from`
  // still narrows the inner pages, where the drill table passes it through.

  const [cashRows, loanRows, recGrouped, recAgeing, topRec, advAgg] = await Promise.all([
    getAccountRollup({ filter: "cash", to, branch }),
    getAccountRollup({ filter: "loans", to, branch }),
    Receivable.aggregate(buildReceivableGroupedStages(txCollection, { level: 1, branch, to })),
    Receivable.aggregate([
      { $match: liveMatch },
      ...buildReceivableAggregationStages(txCollection),
      { $match: { pending: { $gt: 0 } } },
      { $group: { _id: "$ageingBucket", count: { $sum: 1 }, totalPending: { $sum: "$pending" } } },
    ]),
    Receivable.aggregate([
      { $match: liveMatch },
      ...buildReceivableAggregationStages(txCollection),
      { $match: { pending: { $gt: 0 } } },
      { $sort: { pending: -1 } },
      { $limit: 5 },
      { $project: { pending: 1, daysOverdue: 1, "payer.label": 1, revenueCategory: 1 } },
    ]),
    Advance.aggregate([
      ...advanceRemainingStages({ branch }),
      { $group: { _id: null, amount: { $sum: "$remaining" }, count: { $sum: 1 } } },
    ]),
  ]);

  const cash = sumClosing(cashRows);
  const loans = sumClosing(loanRows);
  const receivables = sumClosing(recGrouped);
  const advances = round2(advAgg?.[0]?.amount || 0);

  const [unattributed] = await Transactions.aggregate([
    {
      $match: {
        ...buildBalanceMatch({
          accounts: accountsSync(),
          from: "1970-01-01",
          to: to || new Date().toISOString(),
          branch,
        }),
        furtherMode: { $in: [null, ""] },
      },
    },
    { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);

  return {
    total: round2(cash + loans + receivables),
    sections: [
      { key: "cash-book", label: "Cash & Bank", amount: cash, count: cashRows.length, href: "/admin/assets/cash-book" },
      { key: "receivables", label: "Receivables", amount: receivables, count: sumCount(recGrouped), href: "/admin/assets/receivables" },
      { key: "advances", label: "Advances", amount: advances, count: advAgg?.[0]?.count || 0, href: "/admin/assets/advances" },
      { key: "loan-accounts", label: "Loan Accounts", amount: loans, count: loanRows.length, href: "/admin/assets/loan-accounts" },
    ],
    ageing: recAgeing || [],
    topDocuments: (topRec || []).map((r) => ({
      _id: String(r._id),
      label: r.payer?.label || "—",
      subLabel: r.revenueCategory || "",
      pending: round2(r.pending),
      ageingDays: r.daysOverdue ?? null,
      href: `/admin/assets/receivables?doc=${r._id}`,
    })),
    unattributed: { count: unattributed?.count || 0, amount: round2(unattributed?.amount || 0) },
  };
}

async function liabilitiesOverview({ branch, to }) {
  const txCollection = Transactions.collection.name;
  const liveMatch = { isCancelled: false, ...(branch ? { branch } : {}) };
  // "As of `to`" balances — `from` is deliberately not applied (see assetsOverview).
  const groupedFor = (purpose) =>
    Payable.aggregate(buildPayableGroupedStages(txCollection, { level: 1, branch, to, purpose }));

  // Suspense group-by-account, matching /api/suspense?groupBy=account exactly (closingQS sends
  // branch + `to`, never `from`).
  const suspMatch = { isCancelled: { $ne: true }, isResolved: { $ne: true } };
  if (branch) suspMatch.branch = branch;
  if (to) suspMatch.date = { $lte: new Date(`${to}T23:59:59.999Z`) };

  const [rentRows, empRows, otherRows, suspGrouped, borrowRows, payAgeing, topPay] = await Promise.all([
    groupedFor(RENT_PURPOSES),
    groupedFor(EMPLOYEE_PURPOSES),
    groupedFor(OTHER_PURPOSES),
    SuspenseEntry.aggregate([
      { $match: suspMatch },
      {
        $group: {
          _id: "$account",
          movement: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] } },
          settled: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] } },
          count: { $sum: 1 },
        },
      },
      { $project: { closing: { $subtract: ["$movement", "$settled"] }, count: 1 } },
    ]),
    Payable.aggregate([
      { $match: { expenseCategory: "Borrowings" } },
      ...buildPayableGroupedStages(txCollection, { level: 1, branch, to }),
    ]),
    Payable.aggregate([
      { $match: liveMatch },
      ...buildPayableAggregationStages(txCollection),
      { $match: { pending: { $gt: 0 } } },
      { $group: { _id: "$ageingBucket", count: { $sum: 1 }, totalPending: { $sum: "$pending" } } },
    ]),
    Payable.aggregate([
      { $match: liveMatch },
      ...buildPayableAggregationStages(txCollection),
      { $match: { pending: { $gt: 0 } } },
      { $sort: { pending: -1 } },
      { $limit: 5 },
      { $project: { pending: 1, daysOverdue: 1, purpose: 1, "payee.label": 1, expenseSubType: 1, expenseCategory: 1 } },
    ]),
  ]);

  const rent = sumClosing(rentRows);
  const employees = sumClosing(empRows);
  const other = sumClosing(otherRows);
  const suspense = round2((suspGrouped || []).reduce((s, r) => s + (r.closing || 0), 0));
  const borrowings = sumClosing(borrowRows);

  return {
    total: round2(rent + employees + other + suspense),
    payablesTotal: round2(rent + employees + other),
    sections: [
      { key: "rent", label: "Rent & Utilities", amount: rent, count: sumCount(rentRows), href: "/admin/liabilities/payables/rent" },
      { key: "employees", label: "Employee Payables", amount: employees, count: sumCount(empRows), href: "/admin/liabilities/payables/employees" },
      { key: "other", label: "Other Payables", amount: other, count: sumCount(otherRows), href: "/admin/liabilities/payables/other" },
      { key: "suspense", label: "Suspense", amount: suspense, count: sumCount(suspGrouped), href: "/admin/liabilities/suspense" },
      { key: "borrowings", label: "Borrowings", amount: borrowings, count: sumCount(borrowRows), href: "/admin/liabilities/borrowings" },
    ],
    ageing: payAgeing || [],
    topDocuments: (topPay || []).map((r) => ({
      _id: String(r._id),
      label: r.payee?.label || "—",
      subLabel: r.expenseSubType || r.expenseCategory || (r.purpose || "").replace(/_/g, " "),
      pending: round2(r.pending),
      ageingDays: r.daysOverdue ?? null,
      href: `/admin/liabilities/payables/${payableGroupForPurpose(r.purpose)}?doc=${r._id}`,
    })),
  };
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const side = searchParams.get("side") === "liabilities" ? "liabilities" : "assets";
    const branchFilterObj = resolveBranchFilter(session, searchParams.get("branch") || "");
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";
    const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);

    const meta = {};
    const key = cacheKey("finance", { route: "close-book-overview", side, branch, to }, session);
    const payload = await cached(key, 15, async () => {
      const data =
        side === "liabilities"
          ? await liabilitiesOverview({ branch, to })
          : await assetsOverview({ branch, to });
      return { success: true, asOf: to, ...data };
    }, meta);

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=0, stale-while-revalidate=30", "X-Cache": meta.status },
    });
  } catch (error) {
    console.error("Error building ledger overview:", error);
    return NextResponse.json({ error: "Failed to build overview" }, { status: 500 });
  }
}
