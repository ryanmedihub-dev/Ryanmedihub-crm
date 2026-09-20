import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import Advance from "@/models/Advance";
import { buildReceivableGroupedStages, buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { ADVANCE_REVENUE_CATEGORY } from "@/constants/advanceTypes";
import { loadClosedPeriodSnapshot, blockReasonFromSnapshot } from "@/lib/periodLock";
import { resolveBranchFilter } from "@/lib/branches";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];
const CATEGORY = ADVANCE_REVENUE_CATEGORY;

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const level = Math.min(4, Math.max(1, parseInt(searchParams.get("level") || "1")));
    const subType = searchParams.get("subType") || "";
    const branchFilterObj = resolveBranchFilter(session, searchParams.get("branch") || "");
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const party = searchParams.get("party") || "";
    const status = searchParams.get("status") || "";
    const documentId = searchParams.get("documentId") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const meta = {};
    const key = cacheKey("finance", { route: "advances-grouped", ...Object.fromEntries(searchParams) }, session);
    let data;
    try {
      data = await cached(key, 45, () => computeGroupedAdvances({
        level, subType, branch, from, to, party, status, documentId, page, limit,
      }), meta);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error building grouped advances:", error);
    return NextResponse.json({ error: "Failed to load grouped advances" }, { status: 500 });
  }
}

async function computeGroupedAdvances({ level, subType, branch, from, to, party, status, documentId, page, limit }) {
    if (level === 1) {
      const rows = await Receivable.aggregate([
        { $match: { revenueCategory: CATEGORY } },
        ...buildReceivableGroupedStages(Transactions.collection.name, {
          level: 1,
          branch,
          from,
          to,
          subTypeField: "revenueSubType",
        }),
      ]);
      return { success: true, rows };
    }

    if (level === 2) {
      const rows = await Receivable.aggregate(
        buildReceivableGroupedStages(Transactions.collection.name, {
          level: 2,
          category: CATEGORY,
          branch,
          from,
          to,
          subTypeField: "revenueSubType",
        }),
      );
      return { success: true, rows };
    }

    if (level === 4) {
      if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
        throw NextResponse.json({ error: "A valid documentId is required at level 4" }, { status: 400 });
      }
      const rowMatch = {
        receivableId: new mongoose.Types.ObjectId(documentId),
        isCancelled: { $ne: true },
      };
      if (from || to) {
        rowMatch.date = {};
        if (from) rowMatch.date.$gte = new Date(from);
        if (to) rowMatch.date.$lte = new Date(to);
      }

      const [rows, total] = await Promise.all([
        Advance.aggregate([
          { $match: rowMatch },
          { $sort: { date: 1, _id: 1 } },
          {
            $setWindowFields: {
              sortBy: { date: 1, _id: 1 },
              output: {
                runningBalance: {
                  $sum: { $cond: [{ $eq: ["$direction", "IN"] }, { $multiply: ["$amount", -1] }, "$amount"] },
                  window: { documents: ["unbounded", "current"] },
                },
              },
            },
          },
          { $sort: { date: -1, _id: -1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              date: 1,
              narration: { $ifNull: ["$remarks", "$reference"] },
              amount: 1,
              direction: 1,
              account: 1,
              reference: 1,
              runningBalance: 1,
              branch: 1,
              receivableId: 1,
              createdBy: 1,
            },
          },
        ]),
        Advance.countDocuments(rowMatch),
      ]);

      const closedPeriods = await loadClosedPeriodSnapshot();
      const rowsWithLock = rows.map((r) => ({
        ...r,
        lockReason: blockReasonFromSnapshot(closedPeriods, r.account, r.date),
      }));

      return { success: true, rows: rowsWithLock, total, page, limit };
    }

    const match = { revenueCategory: CATEGORY };
    if (subType) match.revenueSubType = subType;
    match.isCancelled = status === "Cancelled" ? true : { $ne: true };
    if (branch) match.branch = branch;
    if (party) match["payer.label"] = { $regex: party, $options: "i" };

    const stages = [
      { $match: match },
      ...buildReceivableAggregationStages(Transactions.collection.name),
    ];
    if (status && status !== "Cancelled") stages.push({ $match: { status } });
    stages.push({ $sort: { createdAt: -1 } });

    const [facet] = await Receivable.aggregate([
      ...stages,
      {
        $facet: {
          rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ]);
    const pageRows = facet?.rows || [];
    const total = facet?.total?.[0]?.count || 0;
    const closedPeriods = await loadClosedPeriodSnapshot();
    const rows = pageRows.map((r) => ({
      ...r,
      lockReason: blockReasonFromSnapshot(closedPeriods, null, r.createdAt || new Date()),
    }));

    return { success: true, rows, total, page, limit };
}
