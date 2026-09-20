import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin", "owner"];

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
    const purpose = searchParams.get("purpose") || "";
    const payeeKind = searchParams.get("payeeKind") || "";
    const payeeRefId = searchParams.get("payeeRefId") || "";
    const payeeLabel = searchParams.get("payeeLabel") || "";
    const expenseSubType = searchParams.get("expenseSubType") || "";
    const branch = searchParams.get("branch") || "";
    const ageing = searchParams.get("ageing") || "";

    const meta = {};
    const key = cacheKey("finance", { route: "payables-summary", ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 45, () => computePayablesSummary({
      purpose, payeeKind, payeeRefId, payeeLabel, expenseSubType, branch, ageing,
    }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error building payable summary:", error);
    return NextResponse.json({ error: "Failed to fetch payable summary" }, { status: 500 });
  }
}

async function computePayablesSummary({ purpose, payeeKind, payeeRefId, payeeLabel, expenseSubType, branch, ageing }) {
    const txCollection = Transactions.collection.name;

    const TOTALS_GROUP = {
      count: { $sum: 1 },
      totalOwed: { $sum: "$totalAmount" },
      totalPaid: { $sum: "$paid" },
      totalPending: { $sum: "$pending" },
    };
    const emptyTotals = { count: 0, totalOwed: 0, totalPaid: 0, totalPending: 0 };
    const pickTotals = (agg) =>
      agg
        ? { count: agg.count, totalOwed: agg.totalOwed, totalPaid: agg.totalPaid, totalPending: agg.totalPending }
        : emptyTotals;

    // `ageing=1` returns the bucket split *and* the same `overall` totals the plain call
    // returns, so a caller needing both (the admin dashboard) makes one request, and the
    // headline figure is guaranteed to be the sum of the buckets it sits next to.
    if (ageing) {
      const [facet] = await Payable.aggregate([
        { $match: { isCancelled: false, ...(branch ? { branch } : {}) } },
        ...buildPayableAggregationStages(txCollection),
        {
          $facet: {
            overall: [{ $group: { _id: null, ...TOTALS_GROUP } }],
            byBucket: [
              { $match: { pending: { $gt: 0 } } },
              { $group: { _id: "$ageingBucket", count: { $sum: 1 }, totalPending: { $sum: "$pending" } } },
            ],
          },
        },
      ]);
      return {
        success: true,
        byBucket: facet?.byBucket || [],
        overall: pickTotals(facet?.overall?.[0]),
      };
    }

    const sumMatch = async (match) => {
      const [agg] = await Payable.aggregate([
        { $match: match },
        ...buildPayableAggregationStages(txCollection),
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalOwed: { $sum: "$totalAmount" },
            totalPaid: { $sum: "$paid" },
            totalPending: { $sum: "$pending" },
          },
        },
      ]);
      return agg
        ? {
            count: agg.count,
            totalOwed: agg.totalOwed,
            totalPaid: agg.totalPaid,
            totalPending: agg.totalPending,
          }
        : { count: 0, totalOwed: 0, totalPaid: 0, totalPending: 0 };
    };

    const baseMatch = { isCancelled: false };
    if (purpose) baseMatch.purpose = purpose;
    if (branch) baseMatch.branch = branch;

    let overall;
    let byPurpose = null;

    if (purpose) {
      overall = pickTotals((await Payable.aggregate([
        { $match: baseMatch },
        ...buildPayableAggregationStages(txCollection),
        { $group: { _id: null, ...TOTALS_GROUP } },
      ]))[0]);
    } else {
      const [facet] = await Payable.aggregate([
        { $match: baseMatch },
        ...buildPayableAggregationStages(txCollection),
        {
          $facet: {
            overall: [{ $group: { _id: null, ...TOTALS_GROUP } }],
            byPurpose: [
              { $group: { _id: "$purpose", ...TOTALS_GROUP } },
              { $sort: { totalPending: -1 } },
            ],
          },
        },
      ]);
      overall = pickTotals(facet?.overall?.[0]);
      byPurpose = facet?.byPurpose || [];
    }

    let byPayee = null;
    if (payeeKind && (payeeRefId || payeeLabel)) {
      const payeeMatch = { ...baseMatch, "payee.kind": payeeKind };
      if (payeeRefId) payeeMatch["payee.refId"] = new mongoose.Types.ObjectId(payeeRefId);
      if (payeeLabel) payeeMatch["payee.label"] = payeeLabel;
      if (expenseSubType) payeeMatch.expenseSubType = expenseSubType;
      byPayee = await sumMatch(payeeMatch);
    }

    return { success: true, overall, byPayee, byPurpose };
}
