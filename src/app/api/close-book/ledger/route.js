import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import { accountsSync } from "@/lib/masterData";
import {
  buildBalanceMatch,
  buildContraLedgerUnionStage,
  buildSuspenseLedgerUnionStage,
  buildBorrowingLedgerUnionStage,
  buildAdvanceLedgerUnionStage,
  SIGNED_AMOUNT,
  getOpeningBalance,
  round2,
} from "@/lib/accountBalances";
import { checkPeriodLock } from "@/lib/periodLock";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const account = searchParams.get("account") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const transactionCategory = searchParams.get("transactionCategory") || "";
    const method = searchParams.get("method") || "";
    const branch = searchParams.get("branch") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    if (!accountsSync().includes(account)) {
      return NextResponse.json(
        { error: `account is required and must be one of: ${accountsSync().join(", ")}` },
        { status: 400 },
      );
    }
    if (!from || !to) {
      return NextResponse.json({ error: "from and to dates are required" }, { status: 400 });
    }

    const meta = {};
    const key = cacheKey("finance", { route: "close-book-ledger", account, from, to, transactionCategory, method, branch, page, limit }, session);
    const data = await cached(key, 15, () => computeLedger({
      account, from, to, transactionCategory, method, branch, page, limit,
    }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error building account ledger:", error);
    return NextResponse.json({ error: "Failed to build account ledger" }, { status: 500 });
  }
}

async function computeLedger({ account, from, to, transactionCategory, method, branch, page, limit }) {
    const match = buildBalanceMatch({
      account,
      from,
      to,
      transactionCategory,
      method,
      branch,
    });

    const started = Date.now();

    const contraStage = buildContraLedgerUnionStage({
      account,
      from,
      to,
      branch,
      transactionCategory,
      method,
    });

    const suspenseStage = buildSuspenseLedgerUnionStage({
      account,
      from,
      to,
      branch,
      transactionCategory,
      method,
    });

    const borrowingStage = buildBorrowingLedgerUnionStage({
      account,
      from,
      to,
      branch,
      transactionCategory,
      method,
    });

    const advanceStage = buildAdvanceLedgerUnionStage({
      account,
      from,
      to,
      branch,
      transactionCategory,
      method,
    });

    const [opening, [result]] = await Promise.all([
      getOpeningBalance(account, from, branch || null),
      Transactions.aggregate([
        { $match: match },
        {
          $addFields: {
            signedAmount: SIGNED_AMOUNT,
            isContra: { $literal: false },
            isSuspense: { $literal: false },
            sourceKind: { $literal: "TRANSACTION" },
          },
        },
        ...(contraStage ? [contraStage] : []),
        ...(suspenseStage ? [suspenseStage] : []),
        ...(borrowingStage ? [borrowingStage] : []),
        ...(advanceStage ? [advanceStage] : []),
        {
          $setWindowFields: {
            sortBy: { date: 1, _id: 1 },
            output: {
              runningDelta: {
                $sum: "$signedAmount",
                window: { documents: ["unbounded", "current"] },
              },
            },
          },
        },
        {
          $facet: {
            rows: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $lookup: {
                  from: "patients",
                  let: { pid: "$patient" },
                  pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$pid"] } } },
                    { $project: { "personal.name": 1, "personal.phone": 1 } },
                  ],
                  as: "patientDoc",
                },
              },
              {
                $addFields: {
                  patientName: {
                    $let: {
                      vars: { linked: { $arrayElemAt: ["$patientDoc", 0] } },
                      in: {
                        $trim: {
                          input: {
                            $cond: [
                              { $gt: [{ $strLenCP: { $ifNull: ["$patientName", ""] } }, 0] },
                              "$patientName",
                              { $ifNull: ["$$linked.personal.name", ""] },
                            ],
                          },
                        },
                      },
                    },
                  },
                  patientPhone: {
                    $let: {
                      vars: { linked: { $arrayElemAt: ["$patientDoc", 0] } },
                      in: {
                        $trim: {
                          input: {
                            $cond: [
                              { $gt: [{ $strLenCP: { $ifNull: ["$patientPhone", ""] } }, 0] },
                              "$patientPhone",
                              { $ifNull: ["$$linked.personal.phone", ""] },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
              {
                $project: {
                  date: 1,
                  transactionCategory: 1,
                  costType: 1,
                  amount: 1,
                  signedAmount: 1,
                  runningDelta: 1,
                  method: 1,
                  branch: 1,
                  furtherMode: 1,
                  receiptMode: 1,
                  procedure: 1,
                  expense: 1,
                  expenseType: 1,
                  patientName: 1,
                  patientPhone: 1,
                  patient: 1,
                  paymentId: 1,
                  remarks: 1,
                  reversalOf: 1,
                  reversalReason: 1,
                  isReversed: 1,
                  isContra: 1,
                  isSuspense: 1,
                  isBorrowing: 1,
                  isAdvance: 1,
                  fromAccount: 1,
                  toAccount: 1,
                  direction: 1,
                  reference: 1,
                  payableId: 1,
                  receivableId: 1,
                  sourceKind: 1,
                },
              },
            ],
            summary: [
              {
                $group: {
                  _id: null,
                  totalIn: {
                    $sum: { $cond: [{ $gt: ["$signedAmount", 0] }, "$signedAmount", 0] },
                  },
                  totalOut: {
                    $sum: {
                      $cond: [{ $lt: ["$signedAmount", 0] }, { $abs: "$signedAmount" }, 0],
                    },
                  },
                  transactionCount: {
                    $sum: {
                      $cond: [
                        { $or: ["$isContra", "$isSuspense", "$isBorrowing", "$isAdvance"] },
                        0,
                        1,
                      ],
                    },
                  },
                  contraCount: { $sum: { $cond: ["$isContra", 1, 0] } },
                  suspenseCount: { $sum: { $cond: ["$isSuspense", 1, 0] } },
                  borrowingCount: { $sum: { $cond: ["$isBorrowing", 1, 0] } },
                  advanceCount: { $sum: { $cond: ["$isAdvance", 1, 0] } },
                },
              },
            ],
          },
        },
      ]).allowDiskUse(true),
    ]);

    const elapsedMs = Date.now() - started;

    const summary = result?.summary?.[0] || {
      totalIn: 0,
      totalOut: 0,
      transactionCount: 0,
      contraCount: 0,
      suspenseCount: 0,
      borrowingCount: 0,
      advanceCount: 0,
    };
    const openingBalance = round2(opening.openingBalance);
    const totalIn = round2(summary.totalIn);
    const totalOut = round2(summary.totalOut);
    const closingBalance = round2(openingBalance + totalIn - totalOut);
    const movementCount =
      summary.transactionCount +
      summary.contraCount +
      (summary.suspenseCount || 0) +
      (summary.borrowingCount || 0) +
      (summary.advanceCount || 0);

    const rows = await Promise.all(
      (result?.rows || []).map(async (r) => ({
        ...r,
        runningBalance: round2(openingBalance + r.runningDelta),
        lockReason:
          r.sourceKind === "TRANSACTION"
            ? await checkPeriodLock({ furtherMode: account, date: r.date })
            : null,
      })),
    );

    return {
      success: true,
      account,
      period: { from, to },
      openingBalance,
      openingBalanceSeeded: opening.seeded,
      openingAnchorBalance: opening.anchorBalance ?? openingBalance,
      openingCarriedForward: opening.carriedForward ?? 0,
      totalIn,
      totalOut,
      closingBalance,
      transactionCount: summary.transactionCount,
      contraCount: summary.contraCount,
      suspenseCount: summary.suspenseCount || 0,
      borrowingCount: summary.borrowingCount || 0,
      advanceCount: summary.advanceCount || 0,
      movementCount,
      contraExcludedByFilter: !contraStage,
      rows,
      pagination: {
        page,
        limit,
        total: movementCount,
        totalPages: Math.max(1, Math.ceil(movementCount / limit)),
      },
      elapsedMs,
    };
}
