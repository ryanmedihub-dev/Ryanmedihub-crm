import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import { accountsSync } from "@/lib/masterData";
import { resolveBranchFilter } from "@/lib/branches";
import { getAccountRollup, LOAN_ACCOUNTS } from "@/lib/accountRollup";
import {
  buildBalanceMatch,
  getOpeningBalances,
  round2,
  SIGNED_AMOUNT,
} from "@/lib/accountBalances";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || new Date().toISOString();
    const branchParam = searchParams.get("branch") || "";
    const seriesDays = searchParams.get("series") || "";
    const accountsParam = searchParams.get("accounts") || "";

    const branchFilterObj = resolveBranchFilter(session, branchParam);
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";

    const meta = {};
    const key = cacheKey("finance", { route: "close-book-accounts", filter, from, to, branch, seriesDays, accountsParam }, session);
    const data = await cached(key, 15, () => computeAccountsRollup({
      filter, from, to, branch, seriesDays, accountsParam,
    }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error building account rollup:", error);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}

async function computeAccountsRollup({ filter, from, to, branch, seriesDays, accountsParam }) {
    if (seriesDays) {
      const days = Math.min(90, Math.max(1, parseInt(seriesDays)));
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);

      const cashAccounts = accountsSync().filter((a) => !LOAN_ACCOUNTS.includes(a));
      const openings = await getOpeningBalances(cashAccounts, start, branch || null);
      const startingBalance = cashAccounts.reduce(
        (s, a) => s + (openings[a]?.openingBalance || 0),
        0,
      );

      const dailyRows = await Transactions.aggregate([
        { $match: buildBalanceMatch({ accounts: cashAccounts, from: start, to: end, branch }) },
        {
          $project: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "Asia/Kolkata" } },
            net: SIGNED_AMOUNT,
          },
        },
        { $group: { _id: "$day", net: { $sum: "$net" } } },
      ]);

      const byDay = new Map(dailyRows.map((r) => [r._id, r.net]));
      const series = [];
      let running = startingBalance;
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        running = round2(running + (byDay.get(key) || 0));
        series.push({ date: key, balance: running });
      }

      return { success: true, series };
    }

    const rows = await getAccountRollup({ filter, from, to, branch, accountsParam });

    return { success: true, rows };
}
