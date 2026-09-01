import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import { resolveBranchFilter } from "@/lib/branches";
import { checkPeriodLock } from "@/lib/periodLock";
import { buildCashFlowGroupedStages, buildCashFlowLeafMatch } from "@/lib/cashFlowAggregation";

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
    const level = Math.min(3, Math.max(1, parseInt(searchParams.get("level") || "1")));
    const head = searchParams.get("category") || "";
    const sub = searchParams.get("subType") || "";
    const allHeads = searchParams.get("all") === "1";
    const branch = searchParams.get("branch") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const branchFilter = resolveBranchFilter(session, branch);

    if (level < 3) {
      const rows = await Transactions.aggregate(
        buildCashFlowGroupedStages({ level, costType: "Expenses", head, branchFilter, from, to }),
      );
      return NextResponse.json({ success: true, rows });
    }

    if (!head && !allHeads) {
      return NextResponse.json({ error: "head is required at level 3" }, { status: 400 });
    }

    const match = buildCashFlowLeafMatch({
      costType: "Expenses",
      head: allHeads ? "" : head,
      sub: allHeads ? "" : sub,
      branchFilter,
      from,
      to,
    });

    const [rows, total] = await Promise.all([
      Transactions.aggregate([
        { $match: match },
        { $sort: { date: 1, _id: 1 } },
        {
          $setWindowFields: {
            sortBy: { date: 1, _id: 1 },
            output: {
              runningBalance: { $sum: "$amount", window: { documents: ["unbounded", "current"] } },
            },
          },
        },
        { $sort: { date: -1, _id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            date: 1,
            narration: { $ifNull: [{ $ifNull: ["$remarks", "$expenseType"] }, "$expense"] },
            amount: 1,
            method: 1,
            account: "$furtherMode",
            expense: 1,
            expenseType: 1,
            runningBalance: 1,
            branch: 1,
            transactionCategory: 1,
            isSettlement: 1,
          },
        },
      ]),
      Transactions.countDocuments(match),
    ]);

    const rowsWithLock = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        lockReason: await checkPeriodLock({ furtherMode: r.account, date: r.date }),
      })),
    );

    return NextResponse.json({ success: true, rows: rowsWithLock, total, page, limit });
  } catch (error) {
    console.error("Error building grouped payments:", error);
    return NextResponse.json({ error: "Failed to load grouped payments" }, { status: 500 });
  }
}
