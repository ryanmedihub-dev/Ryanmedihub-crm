import { GET as pnlGET } from "@/app/api/close-book/pnl/route";
import { GET as cashFlowGET } from "@/app/api/close-book/cash-flow/route";
import { GET as balanceSheetGET } from "@/app/api/close-book/balance-sheet/route";
import { GET as receivableSummaryGET } from "@/app/api/receivables/summary/route";
import { GET as payableSummaryGET } from "@/app/api/payables/summary/route";
import { GET as payableGroupedGET } from "@/app/api/payables/grouped/route";
import { POST as branchProfitabilityPOST } from "@/app/api/owner/finance/branch-profitability/route";
import { GET as financeTrendGET } from "@/app/api/owner/finance/trend/route";
import { GET as financeExpensesGET } from "@/app/api/owner/finance/expenses/route";
import { GET as salaryIncentiveGET } from "@/app/api/owner/finance/salary-incentive/route";
import { GET as transactionsGetAllGET } from "@/app/api/transactions/get-all/route";
import { toISTDateKey } from "@/lib/owner/dates";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL, AI_DEEP_MODEL } from "../config";
import { round, pct, topN, bottomN, capPayload, prevWindow } from "./_helpers";

const ACCT_NOTE = " You are not an accountant of record; flag anomalies and risks, don't restate accounting rules.";

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const financeFeatures = {
  "finance.overview": {
    title: "Finance Overview", page: "/owner/finance", kinds: ["brief"],
    model: { brief: AI_DEEP_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["from", "to", "branch"],
    focus: { brief: "CFO-style read: profit drivers, cash runway pressure, worst branch margin, receivable/payable imbalance." + ACCT_NOTE },
    async collect(scope) {
      const params = { from: scope.from, to: scope.to, branch: scope.branch };
      const branchOnly = { branch: scope.branch };
      const prev = scope.from && scope.to ? prevWindow(scope.from, scope.to) : null;
      const [pnl, cashFlow, balanceSheet, receivable, payable, branchProfit, trend, pnlPrev] = await Promise.all([
        callRoute(pnlGET, { path: "/api/close-book/pnl", params }),
        callRoute(cashFlowGET, { path: "/api/close-book/cash-flow", params }),
        callRoute(balanceSheetGET, { path: "/api/close-book/balance-sheet", params }),
        callRoute(receivableSummaryGET, { path: "/api/receivables/summary", params: branchOnly }),
        callRoute(payableSummaryGET, { path: "/api/payables/summary", params: branchOnly }),
        callRoute(branchProfitabilityPOST, { path: "/api/owner/finance/branch-profitability", body: { from: scope.from, to: scope.to } }),
        callRoute(financeTrendGET, { path: "/api/owner/finance/trend", params }),
        prev ? callRoute(pnlGET, { path: "/api/close-book/pnl", params: { from: prev.from, to: prev.to, branch: scope.branch } }) : Promise.resolve(null),
      ]);
      return { pnl, cashFlow, balanceSheet, receivable, payable, branchProfit, trend, pnlPrev };
    },
    compute(raw, book, scope) {
      const branchRows = (raw.branchProfit?.rows || []).map((r) => ({ branch: r.branch, revenue: round(r.revenue), expense: round(r.expense), profit: round(r.profit) }));
      const worstBranch = bottomN(branchRows, "profit", 1)[0] || null;
      const daily = raw.trend?.daily || [];
      const netSeries = daily.map((d) => (d.receipts || 0) - (d.payments || 0));
      const trendSummary = daily.length ? {
        first: daily[0], last: daily[daily.length - 1],
        minNet: round(Math.min(...netSeries)), maxNet: round(Math.max(...netSeries)),
      } : null;
      const prevPnl = raw.pnlPrev;
      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" }, branch: scope.branch || "All",
        pnl: { income: round(raw.pnl.income), expense: round(raw.pnl.expense), profit: round(raw.pnl.profit) },
        pnlVsPrevious: prevPnl ? {
          incomeDeltaPct: pct(raw.pnl.income - prevPnl.income, prevPnl.income),
          expenseDeltaPct: pct(raw.pnl.expense - prevPnl.expense, prevPnl.expense),
          profitDeltaPct: prevPnl.profit ? pct(raw.pnl.profit - prevPnl.profit, Math.abs(prevPnl.profit)) : null,
        } : null,
        cashFlow: { receipts: round(raw.cashFlow.receipts), payments: round(raw.cashFlow.payments), balanceLeft: round(raw.cashFlow.balanceLeft) },
        balanceSheetGrandTotal: raw.balanceSheet?.grandTotal || null,
        receivablePending: raw.receivable?.overall?.totalPending ?? null,
        receivableCount: raw.receivable?.overall?.count ?? null,
        payablePending: raw.payable?.overall?.totalPending ?? null,
        payableCount: raw.payable?.overall?.count ?? null,
        branchProfitability: branchRows,
        worstBranch,
        dailyCashTrendSummary: trendSummary,
      });
      return { facts, rowsAnalyzed: branchRows.length };
    },
  },

  "finance.transactions": {
    title: "All Transactions", page: "/owner/finance/transactions", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: ["dateFrom", "dateTo", "branch", "category"],
    focus: { brief: "Money movement mix and unusual days/methods." + ACCT_NOTE },
    async collect(scope) {
      return callRoute(transactionsGetAllGET, { path: "/api/transactions/get-all", params: { ...scope, page: 1, limit: 1000, sortKey: "date", sortDir: "desc" } });
    },
    compute(raw, book, scope) {
      const rows = raw.transactions || [];
      const byMethod = new Map(); const byBranch = new Map(); const byDay = new Map();
      let reversals = 0;
      for (const r of rows) {
        byMethod.set(r.method || "Unspecified", (byMethod.get(r.method || "Unspecified") || 0) + (r.amount || 0));
        byBranch.set(r.branch || "Unspecified", (byBranch.get(r.branch || "Unspecified") || 0) + (r.amount || 0));
        const day = toISTDateKey(r.date);
        if (day) byDay.set(day, (byDay.get(day) || 0) + (r.amount || 0));
        if (r.reversalOf) reversals += 1;
      }
      const dataErrors = raw.total > rows.length ? [`Sample covers the most recent ${rows.length} of ${raw.total} transactions.`] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" }, branch: scope.branch || "All", category: scope.category || "All",
        totalRows: raw.total || rows.length, sampled: raw.total > rows.length,
        statsByCategory: raw.stats || {},
        byMethod: topEntries(byMethod, 10).map(([method, total]) => ({ method, total: round(total) })),
        byBranch: topEntries(byBranch, 10).map(([branch, total]) => ({ branch, total: round(total) })),
        byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-31).map(([date, total]) => ({ date, total: round(total) })),
        reversalsCount: reversals,
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "finance.expenses": {
    title: "Expenses", page: "/owner/finance/expenses", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "branch"],
    focus: { brief: "Where cost grew and whether it's justified by revenue; outliers." + ACCT_NOTE },
    async collect(scope) {
      const params = { dateFrom: scope.dateFrom, dateTo: scope.dateTo, branch: scope.branch, page: 1, pageSize: 200, sortBy: "total", sortDir: "desc" };
      const prev = scope.dateFrom && scope.dateTo ? prevWindow(scope.dateFrom, scope.dateTo) : null;
      const [current, previous] = await Promise.all([
        callRoute(financeExpensesGET, { path: "/api/owner/finance/expenses", params }),
        prev
          ? callRoute(financeExpensesGET, { path: "/api/owner/finance/expenses", params: { dateFrom: prev.from, dateTo: prev.to, branch: scope.branch, page: 1, pageSize: 1 } })
          : Promise.resolve(null),
      ]);
      return { current, previous };
    },
    compute(raw, book, scope) {
      const rows = raw.current.rows || [];
      const byHead = new Map();
      for (const r of rows) byHead.set(r.category || "Unspecified", (byHead.get(r.category || "Unspecified") || 0) + (r.total || 0));
      const previousTotalExpense = raw.previous?.totalExpense ?? null;
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" }, branch: scope.branch || "All",
        totalExpense: round(raw.current.totalExpense), entries: raw.current.entries || 0,
        previousTotalExpense, deltaPct: previousTotalExpense ? pct(raw.current.totalExpense - previousTotalExpense, previousTotalExpense) : null,
        byHead: topEntries(byHead, 15).map(([category, total]) => ({ category, total: round(total) })),
        top10SubTypes: topN(rows, "total", 10).map((r) => ({ category: r.category, subType: r.subType, total: round(r.total), count: r.count })),
        marketingReconciliation: raw.current.marketingReconciliation || null,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "finance.assets": {
    title: "Assets", page: "/owner/finance/assets", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["branch"],
    focus: { brief: "Collection risk: old receivables and concentration." + ACCT_NOTE },
    async collect(scope) {
      const [plain, ageing] = await Promise.all([
        callRoute(receivableSummaryGET, { path: "/api/receivables/summary", params: { branch: scope.branch } }),
        callRoute(receivableSummaryGET, { path: "/api/receivables/summary", params: { ageing: "1", branch: scope.branch } }),
      ]);
      return { plain, ageing };
    },
    compute(raw, book, scope) {
      const byPurpose = raw.plain.byPurpose || [];
      const facts = capPayload({
        branch: scope.branch || "All",
        overall: raw.plain.overall,
        byPurpose,
        ageingBuckets: raw.ageing.byBucket || [],
        dataErrors: ["Top-5 aliased debtor breakdown is not available — /api/receivables/summary has no per-payer list, only branch/purpose/ageing aggregates."],
      });
      return { facts, rowsAnalyzed: byPurpose.length };
    },
  },

  "finance.liabilities": {
    title: "Liabilities", page: "/owner/finance/liabilities", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["branch"],
    focus: { brief: "What must be paid first; overdue exposure." + ACCT_NOTE },
    async collect(scope) {
      const [plain, ageing] = await Promise.all([
        callRoute(payableSummaryGET, { path: "/api/payables/summary", params: { branch: scope.branch } }),
        callRoute(payableSummaryGET, { path: "/api/payables/summary", params: { ageing: "1", branch: scope.branch } }),
      ]);
      return { plain, ageing };
    },
    compute(raw, book, scope) {
      const byPurpose = raw.plain.byPurpose || [];
      const byBucket = raw.ageing.byBucket || [];
      const overdue = byBucket.filter((b) => b._id && b._id !== "0-30").reduce((s, b) => s + (b.totalPending || 0), 0);
      const facts = capPayload({
        branch: scope.branch || "All",
        overall: raw.plain.overall,
        byPurpose,
        ageingBuckets: byBucket,
        overduePending: round(overdue),
        dataErrors: ["Top-5 aliased payee breakdown is not available — /api/payables/summary has no per-payee list, only branch/purpose/ageing aggregates."],
      });
      return { facts, rowsAnalyzed: byPurpose.length };
    },
  },

  "finance.salaryIncentive": {
    title: "Salary & Incentive", page: "/owner/finance/salary-incentive", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "branch"],
    focus: { brief: "Payroll liability and payment discipline." + ACCT_NOTE },
    async collect(scope) {
      
      
      return callRoute(salaryIncentiveGET, { path: "/api/owner/finance/salary-incentive", params: { dateFrom: scope.dateFrom, dateTo: scope.dateTo, branch: scope.branch, page: 1, pageSize: 1 } });
    },
    compute(raw, book, scope) {
      const t = raw.totals || {};
      const pending = (due, paid) => Math.max(0, (due || 0) - (paid || 0));
      const byMonth = raw.byMonth || [];
      
      
      
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 1);
      const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
      const oldPendingEmployeeCount = byMonth
        .filter((m) => m.key !== "Unspecified" && m.key < cutoffKey && (m.salaryDue || 0) > (m.salaryPaid || 0))
        .reduce((s, m) => s + (m.count || 0), 0);
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" }, branch: scope.branch || "All",
        employees: t.employees || 0,
        sections: {
          salary: { due: round(t.salaryDue), paid: round(t.salaryPaid), pending: round(pending(t.salaryDue, t.salaryPaid)) },
          incentive: { due: round(t.incentiveDue), paid: round(t.incentivePaid), pending: round(pending(t.incentiveDue, t.incentivePaid)) },
        },
        pendingByBranch: (raw.byBranch || []).map((r) => ({ branch: r.key, count: r.count, pending: round(pending(r.salaryDue, r.salaryPaid)) })),
        oldPendingEmployeeCount,
        dataErrors: ["Per-employee salary/incentive figures are intentionally excluded — only aggregate totals and counts are used."],
      });
      return { facts, rowsAnalyzed: (raw.byBranch || []).length };
    },
  },

  "finance.rent": {
    title: "Rent", page: "/owner/finance/rent", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 120 },
    scopeParams: ["branch"],
    focus: { brief: "Rent arrears and which property is slipping." + ACCT_NOTE },
    async collect(scope) {
      return callRoute(payableGroupedGET, { path: "/api/payables/grouped", params: { groupBy: "party", purpose: "RENT", branch: scope.branch, page: 1, limit: 200 } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const properties = rows.map((r) => ({
        property: book.alias("V", r.key, r.label), due: round(r.movement), paid: round(r.settled), pending: round(r.closing), recordCount: r.count,
      }));
      const facts = capPayload({
        branch: scope.branch || "All",
        propertyCount: properties.length,
        totalPending: round(properties.reduce((s, p) => s + p.pending, 0)),
        totalPaid: round(properties.reduce((s, p) => s + p.paid, 0)),
        properties,
        dataErrors: ["Per-record due date, status and overdue-month counts are not returned by this grouped endpoint — only period totals (due/paid/pending) per property are available."],
      });
      return { facts, rowsAnalyzed: properties.length };
    },
  },
};

export default financeFeatures;
