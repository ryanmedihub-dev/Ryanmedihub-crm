import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import { unsettledMethodsSync, accountsSync } from "@/lib/masterData";
import { cacheKey, cached } from "@/lib/cache";
const ALLOWED_ROLES = ["admin", "super-admin", "owner"];

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
    const selectedAccounts = accountsParam
      ? accountsParam.split(",").filter((a) => accountsSync().includes(a))
      : [];

    const meta = {};
    const key = cacheKey("finance", { route: "close-book-pnl", from, to, branch, accounts: selectedAccounts.join(",") }, session);
    const data = await cached(key, 15, () => computePnl({ from, to, branch, selectedAccounts }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error computing P&L:", error);
    return NextResponse.json({ error: "Failed to compute P&L" }, { status: 500 });
  }
}

async function computePnl({ from, to, branch, selectedAccounts }) {
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

    const [directRevenueAgg, directExpenseAgg, receivablesRaisedAgg, payablesRaisedAgg] = await Promise.all([
      Transactions.aggregate([
        {
          $match: {
            ...txBase,
            costType: "Revenue",
            receivableId: null,
            $or: [
              { receivableAllocations: { $exists: false } },
              { receivableAllocations: { $size: 0 } },
            ],
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transactions.aggregate([
        { $match: { ...txBase, costType: "Expenses", payableId: null } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Receivable.aggregate([
        { $match: obligationBase },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Payable.aggregate([
        { $match: obligationBase },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const round2 = (n) => Math.round((n || 0) * 100) / 100;
    const income = round2((directRevenueAgg[0]?.total || 0) + (receivablesRaisedAgg[0]?.total || 0));
    const expense = round2((directExpenseAgg[0]?.total || 0) + (payablesRaisedAgg[0]?.total || 0));

    return { success: true, income, expense, profit: round2(income - expense) };
}
