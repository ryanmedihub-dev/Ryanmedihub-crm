import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import CollabCase from "@/models/CollabCase";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { COLLAB_BRANCHES } from "@/lib/branches";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["collab", "admin", "super-admin"];

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const clinicParam = searchParams.get("clinic") || "";
    if (clinicParam && !COLLAB_BRANCHES.includes(clinicParam)) {
      return NextResponse.json({ error: "Invalid clinic" }, { status: 400 });
    }

    const clinicMatch = clinicParam ? clinicParam : { $in: COLLAB_BRANCHES };
    const txCollection = Transactions.collection.name;

    const meta = {};
    const key = cacheKey("finance", { route: "collab-balances", clinic: clinicParam }, session);
    const { balances, totals } = await cached(key, 30, () => computeBalances(clinicMatch, txCollection), meta);

    const res = NextResponse.json({ success: true, balances, ...totals });
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error building collab balances:", error);
    return NextResponse.json({ error: "Failed to fetch collab balances" }, { status: 500 });
  }
}

async function computeBalances(clinicMatch, txCollection) {
    const [receivableRows, payableRows, caseRows] = await Promise.all([
      Receivable.aggregate([
        {
          $match: {
            "payer.kind": "COLLAB_CLINIC",
            "payer.label": clinicMatch,
            branch: { $in: COLLAB_BRANCHES },
            isCancelled: { $ne: true },
          },
        },
        ...buildReceivableAggregationStages(txCollection),
        {
          $group: {
            _id: "$payer.label",
            totalReceivable: { $sum: "$totalAmount" },
            outstandingReceivable: { $sum: "$pending" },
            receivableCount: { $sum: 1 },
          },
        },
      ]),
      Payable.aggregate([
        {
          $match: {
            "payee.kind": "COLLAB_CLINIC",
            "payee.label": clinicMatch,
            branch: { $in: COLLAB_BRANCHES },
            isCancelled: { $ne: true },
          },
        },
        ...buildPayableAggregationStages(txCollection),
        {
          $group: {
            _id: "$payee.label",
            totalPayable: { $sum: "$totalAmount" },
            outstandingPayable: { $sum: "$pending" },
            payableCount: { $sum: 1 },
          },
        },
      ]),
      CollabCase.aggregate([
        { $match: { clinic: clinicMatch, status: { $ne: "CANCELLED" } } },
        {
          $group: {
            _id: "$clinic",
            openCaseCount: { $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] } },
            caseCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const leaked = [...receivableRows, ...payableRows, ...caseRows].filter(
      (r) => !COLLAB_BRANCHES.includes(r._id),
    );
    if (leaked.length > 0) {
      console.error("Collab balance query returned non-collab-branch rows:", leaked);
    }

    const receivableBy = new Map(receivableRows.map((r) => [r._id, r]));
    const payableBy = new Map(payableRows.map((r) => [r._id, r]));
    const caseBy = new Map(caseRows.map((r) => [r._id, r]));

    const clinicsInvolved = new Set([
      ...receivableRows.map((r) => r._id),
      ...payableRows.map((r) => r._id),
      ...caseRows.map((r) => r._id),
    ]);

    const balances = [...clinicsInvolved]
      .filter((clinic) => COLLAB_BRANCHES.includes(clinic))
      .map((clinic) => {
        const r = receivableBy.get(clinic);
        const p = payableBy.get(clinic);
        const c = caseBy.get(clinic);
        const outstandingReceivable = r?.outstandingReceivable || 0;
        const outstandingPayable = p?.outstandingPayable || 0;
        return {
          clinic,
          outstandingReceivable,
          outstandingPayable,
          totalReceivable: r?.totalReceivable || 0,
          totalPayable: p?.totalPayable || 0,
          receivableCount: r?.receivableCount || 0,
          payableCount: p?.payableCount || 0,
          netPosition: outstandingReceivable - outstandingPayable,
          openCaseCount: c?.openCaseCount || 0,
          caseCount: c?.caseCount || 0,
        };
      });

    balances.sort((a, b) => a.clinic.localeCompare(b.clinic));

    const totals = balances.reduce(
      (acc, b) => {
        acc.totalReceivable += b.outstandingReceivable;
        acc.totalPayable += b.outstandingPayable;
        return acc;
      },
      { totalReceivable: 0, totalPayable: 0 },
    );

    return { balances, totals };
}
