import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import SuspenseEntry from "@/models/SuspenseEntry";
import { accountsSync, unsettledMethodsSync } from "@/lib/masterData";
import { resolveBranchFilter } from "@/lib/branches";
import {
  buildBalanceMatch,
  buildContraUnionStage,
  buildSuspenseUnionStage,
  buildBorrowingUnionStage,
  buildAdvanceUnionStage,
  buildSuspenseMatch,
  getOpeningBalances,
  round2,
  TRANSACTION_TO_MOVEMENT,
} from "@/lib/accountBalances";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";

const ALLOWED_ROLES = ["admin", "super-admin"];
const LOAN_ACCOUNTS = ["Bajaj Loan", "Fibe Loan"];

const TX_PROJECT = {
  _id: 1,
  date: 1,
  amount: 1,
  method: 1,
  branch: 1,
  costType: 1,
  transactionCategory: 1,
  account: "$furtherMode",
  narration: {
    $ifNull: [
      "$remarks",
      { $ifNull: ["$expenseType", { $ifNull: ["$procedure", "$expense"] }] },
    ],
  },
  party: {
    $ifNull: ["$patientName", { $ifNull: ["$paidTo.name", "$expense"] }],
  },
  category: { $ifNull: ["$expense", "$transactionCategory"] },
};

const txRow = (r) => ({
  id: String(r._id),
  kind: "TX",
  date: r.date,
  narration: r.narration || "—",
  party: r.party || "—",
  category: r.category || "—",
  account: r.account || "—",
  method: r.method || "—",
  branch: r.branch || "—",
  amount: round2(r.amount),
});

const docRow = (r, isPayable) => ({
  id: String(r._id),
  kind: isPayable ? "PAYABLE" : "RECEIVABLE",
  date: r.createdAt,
  dueDate: r.dueDate || null,
  narration: (r.purpose || "").replace(/_/g, " ") || "—",
  party: (isPayable ? r.payee?.label : r.payer?.label) || "—",
  category: (isPayable ? r.expenseCategory : r.revenueCategory) || "—",
  branch: r.branch || "—",
  status: r.status || "—",
  ageingBucket: r.ageingBucket || null,
  daysOverdue: r.daysOverdue ?? null,
  totalAmount: round2(r.totalAmount),
  settled: round2(isPayable ? r.paid : r.received),
  amount: round2(r.pending),
});

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const head = searchParams.get("head") || "";
    const bucket = searchParams.get("bucket") || "";
    const accountsParam = searchParams.get("accounts") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const pagedSection = searchParams.get("section") || "";

    const branchFilterObj = resolveBranchFilter(session, searchParams.get("branch") || "");
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";

    const selectedAccounts = accountsParam
      ? accountsParam.split(",").filter((a) => accountsSync().includes(a))
      : [];

    const skipFor = (key) => (pagedSection === key || !pagedSection ? (page - 1) * limit : 0);

    
    const dateRange = {};
    if (from) dateRange.$gte = new Date(from);
    if (to) dateRange.$lte = new Date(to);

    const txBase = {
      approvalStatus: { $nin: ["PENDING", "REJECTED"] },
      method: { $nin: unsettledMethodsSync() },
    };
    if (Object.keys(dateRange).length) txBase.date = dateRange;
    if (branch) txBase.branch = branch;
    if (selectedAccounts.length > 0) txBase.furtherMode = { $in: selectedAccounts };

    const obligationBase = { isCancelled: { $ne: true }, excludeFromPnl: { $ne: true } };
    if (Object.keys(dateRange).length) obligationBase.createdAt = dateRange;
    if (branch) obligationBase.branch = branch;

    
    async function txSection({ key, label, match, sort = { date: -1, _id: -1 } }) {
      const [rows, agg] = await Promise.all([
        Transactions.aggregate([
          { $match: match },
          { $project: TX_PROJECT },
          { $sort: sort },
          { $skip: skipFor(key) },
          { $limit: limit },
        ]),
        Transactions.aggregate([
          { $match: match },
          { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
      ]);
      const count = agg[0]?.count || 0;
      return {
        key,
        label,
        shape: "transactions",
        total: round2(agg[0]?.total || 0),
        count,
        rows: rows.map(txRow),
        hasMore: skipFor(key) + rows.length < count,
      };
    }

    async function obligationSection({ key, label, Model, isPayable, match, amountField }) {
      const [rows, agg] = await Promise.all([
        Model.aggregate([
          { $match: match },
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: skipFor(key) },
          { $limit: limit },
        ]),
        Model.aggregate([
          { $match: match },
          { $group: { _id: null, total: { $sum: `$${amountField}` }, count: { $sum: 1 } } },
        ]),
      ]);
      const count = agg[0]?.count || 0;
      return {
        key,
        label,
        shape: "obligations",
        total: round2(agg[0]?.total || 0),
        count,
        rows: rows.map((r) => ({
          id: String(r._id),
          kind: isPayable ? "PAYABLE" : "RECEIVABLE",
          date: r.createdAt,
          dueDate: r.dueDate || null,
          narration: (r.purpose || "").replace(/_/g, " ") || "—",
          party: (isPayable ? r.payee?.label : r.payer?.label) || "—",
          category: (isPayable ? r.expenseCategory : r.revenueCategory) || "—",
          branch: r.branch || "—",
          amount: round2(r.totalAmount),
        })),
        hasMore: skipFor(key) + rows.length < count,
      };
    }

    
    async function pendingDocSection({ key, label, isPayable, overdueOnly = false, bucket = "" }) {
      const Model = isPayable ? Payable : Receivable;
      const stages = isPayable
        ? buildPayableAggregationStages(Transactions.collection.name)
        : buildReceivableAggregationStages(Transactions.collection.name);

      const post = [{ $match: { pending: { $gt: 0 } } }];
      if (bucket) {
        post.push({ $match: { ageingBucket: bucket } });
      } else if (overdueOnly) {
        
        post.push({ $match: { ageingBucket: { $nin: [null, "current"] } } });
      }

      const [facet] = await Model.aggregate([
        { $match: { isCancelled: false, ...(branch ? { branch } : {}) } },
        ...stages,
        ...post,
        {
          $facet: {
            rows: [
              { $sort: { pending: -1, dueDate: 1 } },
              { $skip: skipFor(key) },
              { $limit: limit },
            ],
            totals: [{ $group: { _id: null, total: { $sum: "$pending" }, count: { $sum: 1 } } }],
          },
        },
      ]);
      const rows = facet?.rows || [];
      const count = facet?.totals?.[0]?.count || 0;
      return {
        key,
        label,
        shape: "documents",
        total: round2(facet?.totals?.[0]?.total || 0),
        count,
        rows: rows.map((r) => docRow(r, isPayable)),
        hasMore: skipFor(key) + rows.length < count,
      };
    }

    
    async function accountSection({ key, label, accounts }) {
      const openingFrom = "1970-01-01";
      const contraStage = buildContraUnionStage({ from: openingFrom, to, branch });
      const suspenseStage = buildSuspenseUnionStage({ from: openingFrom, to, branch });
      const borrowingStage = buildBorrowingUnionStage({ from: openingFrom, to, branch });
      const advanceStage = buildAdvanceUnionStage({ from: openingFrom, to, branch });

      const [openings, movementRows] = await Promise.all([
        getOpeningBalances(accounts, openingFrom, branch || null),
        Transactions.aggregate([
          { $match: buildBalanceMatch({ accounts, from: openingFrom, to, branch }) },
          TRANSACTION_TO_MOVEMENT,
          ...(contraStage ? [contraStage] : []),
          ...(suspenseStage ? [suspenseStage] : []),
          ...(borrowingStage ? [borrowingStage] : []),
          ...(advanceStage ? [advanceStage] : []),
          { $match: { account: { $in: accounts } } },
          {
            $group: {
              _id: "$account",
              totalIn: { $sum: "$in" },
              totalOut: { $sum: "$out" },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const byAccount = new Map(movementRows.map((r) => [r._id, r]));
      const rows = accounts
        .map((account) => {
          const m = byAccount.get(account);
          const opening = round2(openings[account].openingBalance);
          const totalIn = round2(m?.totalIn || 0);
          const totalOut = round2(m?.totalOut || 0);
          return {
            id: account,
            kind: "ACCOUNT",
            account,
            opening,
            totalIn,
            totalOut,
            amount: round2(opening + totalIn - totalOut),
            count: m?.count || 0,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      return {
        key,
        label,
        shape: "accounts",
        total: round2(rows.reduce((s, r) => s + r.amount, 0)),
        count: rows.length,
        rows,
        hasMore: false,
      };
    }

    async function suspenseSection() {
      
      
      const suspenseTo = to && to.length === 10 ? `${to}T23:59:59.999Z` : to;
      const match = { ...buildSuspenseMatch({ to: suspenseTo, branch }) };
      if (selectedAccounts.length > 0) match.account = { $in: selectedAccounts };

      const [rows, agg] = await Promise.all([
        SuspenseEntry.find(match).sort({ date: -1 }).skip(skipFor("suspense")).limit(limit).lean(),
        SuspenseEntry.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              total: {
                $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, { $multiply: ["$amount", -1] }, "$amount"] },
              },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);
      const count = agg[0]?.count || 0;
      return {
        key: "suspense",
        label: "Unreclassified suspense entries",
        shape: "transactions",
        total: round2(agg[0]?.total || 0),
        count,
        rows: rows.map((r) => ({
          id: String(r._id),
          kind: "SUSPENSE",
          date: r.date,
          narration: r.remarks || r.reference || "—",
          party: "—",
          category: r.direction === "OUT" ? "Debit" : "Credit",
          account: r.account || "—",
          method: "Suspense",
          branch: r.branch || "—",
          amount: round2(r.direction === "OUT" ? -r.amount : r.amount),
        })),
        hasMore: skipFor("suspense") + rows.length < count,
      };
    }

    
    const cashAccounts = accountsSync().filter((a) => !LOAN_ACCOUNTS.includes(a)).filter(
      (a) => selectedAccounts.length === 0 || selectedAccounts.includes(a),
    );
    const loanAccounts = LOAN_ACCOUNTS.filter(
      (a) => selectedAccounts.length === 0 || selectedAccounts.includes(a),
    );
    const cashFlowAccounts = selectedAccounts.length > 0 ? selectedAccounts : accountsSync();

    let label = metric;
    let sections = [];

    switch (metric) {
      case "cash-bank":
        label = "Cash & Bank";
        sections = [await accountSection({ key: "cash-bank", label: "Cash and bank accounts", accounts: cashAccounts })];
        break;

      case "loans":
        label = "Loan / financing accounts";
        sections = [await accountSection({ key: "loans", label: "Loan accounts", accounts: loanAccounts })];
        break;

      case "receivables":
        label = bucket ? `Receivables — ${bucket}` : "Receivables";
        sections = [await pendingDocSection({ key: "receivables", label: bucket ? `Ageing bucket ${bucket}` : "Receivables still outstanding", isPayable: false, bucket })];
        break;

      case "payables":
        label = bucket ? `Payables — ${bucket}` : "Payables";
        sections = [await pendingDocSection({ key: "payables", label: bucket ? `Ageing bucket ${bucket}` : "Payables still outstanding", isPayable: true, bucket })];
        break;

      case "overdue-receivables":
        label = "Overdue receivables";
        sections = [await pendingDocSection({ key: "overdue-receivables", label: "Past their due date", isPayable: false, overdueOnly: true })];
        break;

      case "overdue-payables":
        label = "Overdue payables";
        sections = [await pendingDocSection({ key: "overdue-payables", label: "Past their due date", isPayable: true, overdueOnly: true })];
        break;

      case "suspense":
        label = "Suspense";
        sections = [await suspenseSection()];
        break;

      case "receipts":
        label = "Receipts";
        sections = [
          await txSection({
            key: "receipts",
            label: "Money in",
            match: { ...buildBalanceMatch({ accounts: cashFlowAccounts, from, to, branch }), costType: "Revenue" },
          }),
        ];
        break;

      case "payments":
        label = "Payments";
        sections = [
          await txSection({
            key: "payments",
            label: "Money out",
            match: { ...buildBalanceMatch({ accounts: cashFlowAccounts, from, to, branch }), costType: "Expenses" },
          }),
        ];
        break;

      case "gross-sales": {
        label = "Gross Sales";
        
        
        const salesMatch = {
          costType: "Revenue",
          approvalStatus: { $nin: ["PENDING", "REJECTED"] },
        };
        if (branch) salesMatch.branch = branch;
        if (Object.keys(dateRange).length) salesMatch.date = dateRange;
        sections = [
          await txSection({ key: "gross-sales", label: "Revenue transactions", match: salesMatch }),
        ];
        break;
      }

      case "pnl-income":
        label = "Income (accrual)";
        sections = await Promise.all([
          txSection({
            key: "direct-revenue",
            label: "Direct sales",
            match: {
              ...txBase,
              costType: "Revenue",
              receivableId: null,
              $or: [
                { receivableAllocations: { $exists: false } },
                { receivableAllocations: { $size: 0 } },
              ],
            },
          }),
          obligationSection({
            key: "receivables-raised",
            label: "Receivables raised this period",
            Model: Receivable,
            isPayable: false,
            match: obligationBase,
            amountField: "totalAmount",
          }),
        ]);
        break;

      case "pnl-expense":
        label = head ? `Expense — ${head}` : "Expense (accrual)";
        sections = await Promise.all([
          txSection({
            key: "direct-expense",
            label: "Direct expenses",
            match: {
              ...txBase,
              costType: "Expenses",
              payableId: null,
              ...(head ? { expense: head } : {}),
            },
          }),
          obligationSection({
            key: "payables-raised",
            label: "Payables raised this period",
            Model: Payable,
            isPayable: true,
            match: { ...obligationBase, ...(head ? { expenseCategory: head } : {}) },
            amountField: "totalAmount",
          }),
        ]);
        break;

      case "unattributed":
        label = "Transactions missing account attribution";
        sections = [
          await txSection({
            key: "unattributed",
            label: "No further-mode account set (all time)",
            match: {
              ...buildBalanceMatch({ accounts: accountsSync(), from: "1970-01-01", to, branch }),
              furtherMode: { $in: [null, ""] },
            },
          }),
        ];
        break;

      case "assets":
        label = "Total Assets";
        sections = await Promise.all([
          accountSection({ key: "cash-bank", label: "Cash & bank", accounts: cashAccounts }),
          pendingDocSection({ key: "receivables", label: "Receivables outstanding", isPayable: false }),
        ]);
        break;

      case "liabilities":
        label = "Total Liabilities";
        sections = await Promise.all([
          pendingDocSection({ key: "payables", label: "Payables outstanding", isPayable: true }),
          suspenseSection(),
        ]);
        break;

      case "net-position": {
        label = "Net Position";
        const [cash, recv, pay, susp] = await Promise.all([
          accountSection({ key: "cash-bank", label: "Cash & bank", accounts: cashAccounts }),
          pendingDocSection({ key: "receivables", label: "Receivables outstanding", isPayable: false }),
          pendingDocSection({ key: "payables", label: "Payables outstanding", isPayable: true }),
          suspenseSection(),
        ]);
        
        
        sections = [cash, recv, { ...pay, sign: -1 }, { ...susp, sign: -1 }];
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown metric "${metric}"` }, { status: 400 });
    }

    const grandTotal = round2(
      sections.reduce((s, sec) => s + (sec.sign ?? 1) * sec.total, 0),
    );

    return NextResponse.json({
      success: true,
      metric,
      label,
      head: head || null,
      bucket: bucket || null,
      sections,
      grandTotal,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error building dashboard drilldown:", error);
    return NextResponse.json({ error: "Failed to build drill-down" }, { status: 500 });
  }
}
