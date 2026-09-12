import Transactions from "@/models/Transactions";
import { accountsSync, unsettledMethodsSync } from "@/lib/masterData";
import { buildBalanceMatch } from "@/lib/accountBalances";

// One implementation of the Finance landing numbers. Both the /owner/finance
// routes and Sanya's `get_finance_summary` tool call these.

const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Revenue / expense / profit per branch for a period — approved, settled
 * transactions only (same filter /owner/finance's branch table has always used).
 */
export async function getBranchProfitability({ from, to }) {
  const txBase = {
    approvalStatus: { $nin: ["PENDING", "REJECTED"] },
    method: { $nin: unsettledMethodsSync() },
    date: { $gte: new Date(from), $lte: new Date(to) },
  };

  const [revenueByBranch, expenseByBranch] = await Promise.all([
    Transactions.aggregate([
      { $match: { ...txBase, costType: "Revenue" } },
      { $group: { _id: "$branch", total: { $sum: "$amount" } } },
    ]),
    Transactions.aggregate([
      { $match: { ...txBase, costType: "Expenses" } },
      { $group: { _id: "$branch", total: { $sum: "$amount" } } },
    ]),
  ]);

  const revenueMap = Object.fromEntries(revenueByBranch.map((r) => [r._id || "(no branch)", r.total]));
  const expenseMap = Object.fromEntries(expenseByBranch.map((r) => [r._id || "(no branch)", r.total]));
  const allBranches = [...new Set([...Object.keys(revenueMap), ...Object.keys(expenseMap)])];

  const rows = allBranches
    .map((branch) => {
      const revenue = round2(revenueMap[branch] || 0);
      const expense = round2(expenseMap[branch] || 0);
      return { branch, revenue, expense, profit: round2(revenue - expense) };
    })
    .sort((a, b) => b.profit - a.profit);

  const totals = rows.reduce(
    (t, r) => ({ revenue: round2(t.revenue + r.revenue), expense: round2(t.expense + r.expense), profit: round2(t.profit + r.profit) }),
    { revenue: 0, expense: 0, profit: 0 },
  );

  return { rows, totals };
}

/**
 * Daily cash-basis receipts/payments for the landing trend chart. Reuses the
 * EXACT match filter close-book's cash-flow route uses (buildBalanceMatch) —
 * same definition, just grouped by day — so this sums to the same receipts/
 * payments the landing KPI row shows. Deliberately NOT a P&L trend:
 * /api/close-book/pnl's accrual logic is nontrivial and re-deriving it per
 * day risked a second, disagreeing number — cash-basis, labelled as such.
 */
export async function getFinanceTrend({ from = "", to = "", branch = "" }) {
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
  const daily = Object.values(byDate);
  const totals = daily.reduce(
    (t, d) => ({ receipts: round2(t.receipts + d.receipts), payments: round2(t.payments + d.payments) }),
    { receipts: 0, payments: 0 },
  );
  return { daily, totals };
}

/**
 * Expense heads for a period: total + the top categories, grouped the same
 * way /owner/finance/expenses groups its table (expense × expenseType).
 */
export async function getExpenseSummary({ from = "", to = "", branch = "All", top = 10 }) {
  const match = { transactionCategory: "EXPENSE" };
  if (branch && branch !== "All") match.branch = branch;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  const [result] = await Transactions.aggregate([
    { $match: match },
    {
      $group: {
        _id: { category: { $ifNull: ["$expense", "Unspecified"] }, subType: { $ifNull: ["$expenseType", "Unspecified"] } },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $facet: {
        totals: [{ $group: { _id: null, totalExpense: { $sum: "$total" }, entries: { $sum: "$count" }, heads: { $sum: 1 } } }],
        top: [
          { $sort: { total: -1 } },
          { $limit: Math.max(1, Math.min(50, top)) },
          { $project: { _id: 0, category: "$_id.category", subType: "$_id.subType", total: 1, count: 1 } },
        ],
      },
    },
  ]);
  const t = result?.totals?.[0] || { totalExpense: 0, entries: 0, heads: 0 };
  return { totalExpense: round2(t.totalExpense), entries: t.entries, heads: t.heads, top: result?.top || [] };
}
