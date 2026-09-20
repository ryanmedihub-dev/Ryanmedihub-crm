import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import { accountsSync } from "@/lib/masterData";
import { buildBalanceMatch } from "@/lib/accountBalances";
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
      : accountsSync();

    const meta = {};
    const key = cacheKey("finance", { route: "close-book-cash-flow", from, to, branch, accounts: selectedAccounts.join(",") }, session);
    const data = await cached(key, 15, async () => {
      const match = buildBalanceMatch({ accounts: selectedAccounts, from, to, branch });

      const [receiptsAgg, paymentsAgg] = await Promise.all([
        Transactions.aggregate([
          { $match: { ...match, costType: "Revenue" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Transactions.aggregate([
          { $match: { ...match, costType: "Expenses" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

      const round2 = (n) => Math.round((n || 0) * 100) / 100;
      const receipts = round2(receiptsAgg[0]?.total || 0);
      const payments = round2(paymentsAgg[0]?.total || 0);

      return { success: true, receipts, payments, balanceLeft: round2(receipts - payments) };
    }, meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error computing cash flow:", error);
    return NextResponse.json({ error: "Failed to compute cash flow" }, { status: 500 });
  }
}
