import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Payable from "@/models/Payable";
import { unsettledMethodsSync, accountsSync } from "@/lib/masterData";
import { cacheKey, cached } from "@/lib/cache";
const ALLOWED_ROLES = ["admin", "super-admin", "owner"];

/**
 * Expense by head.
 *
 * Deliberately mirrors /api/close-book/pnl's `expense` figure term for term:
 *   expense = direct expense transactions (payableId: null) + payables raised
 * so the sum of every row returned here equals the P&L Expense card exactly.
 *
 * The old dashboard chart read /api/payables/grouped instead, which meant every head in
 * DIRECT_PAYMENT_CATEGORIES — Marketing (Meta/Google ads), Office, Travelling, Bank
 * Charges, Drawings, … — never appeared at all, because those are paid directly and never
 * raise a payable.
 *
 * Direct expenses carry the head on Transactions.expense; payables carry it on
 * Payable.expenseCategory.
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
    const accountsParam = searchParams.get("accounts") || "";
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const selectedAccounts = accountsParam
      ? accountsParam.split(",").filter((a) => accountsSync().includes(a))
      : [];

    const meta = {};
    const key = cacheKey("finance", { route: "admin-expense-by-head", from, to, branch, accounts: selectedAccounts.join(","), limit }, session);
    const data = await cached(key, 60, () => computeExpenseByHead({ from, to, branch, selectedAccounts, limit }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error computing expense by head:", error);
    return NextResponse.json({ error: "Failed to compute expense by head" }, { status: 500 });
  }
}

async function computeExpenseByHead({ from, to, branch, selectedAccounts, limit }) {
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

    const [directRows, payableRows] = await Promise.all([
      Transactions.aggregate([
        { $match: { ...txBase, costType: "Expenses", payableId: null } },
        {
          $group: {
            _id: { $ifNull: ["$expense", "Uncategorised"] },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Payable.aggregate([
        { $match: obligationBase },
        {
          $group: {
            _id: { $ifNull: ["$expenseCategory", "Uncategorised"] },
            total: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const round2 = (n) => Math.round((n || 0) * 100) / 100;
    const byHead = new Map();
    const add = (rows, field, countField) => {
      rows.forEach((r) => {
        const key = r._id || "Uncategorised";
        const entry = byHead.get(key) || {
          key,
          label: key,
          direct: 0,
          payable: 0,
          directCount: 0,
          payableCount: 0,
        };
        entry[field] += r.total || 0;
        entry[countField] += r.count || 0;
        byHead.set(key, entry);
      });
    };
    add(directRows, "direct", "directCount");
    add(payableRows, "payable", "payableCount");

    const all = [...byHead.values()]
      .map((e) => ({
        ...e,
        direct: round2(e.direct),
        payable: round2(e.payable),
        // `movement` keeps the key the chart already binds to
        movement: round2(e.direct + e.payable),
        count: e.directCount + e.payableCount,
      }))
      .sort((a, b) => b.movement - a.movement);

    const grandTotal = round2(all.reduce((s, r) => s + r.movement, 0));

    return {
      success: true,
      rows: all.slice(0, limit),
      headCount: all.length,
      shownTotal: round2(all.slice(0, limit).reduce((s, r) => s + r.movement, 0)),
      grandTotal,
    };
}
