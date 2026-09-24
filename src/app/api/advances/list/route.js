import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Advance from "@/models/Advance";
import Employee from "@/models/Employee";
import Receivable from "@/models/Receivable";
import { resolveBranchFilter } from "@/lib/branches";
import { settledTotalExpr } from "@/lib/advanceSettlements";
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
    const account = searchParams.get("account") || "";
    const direction = searchParams.get("direction") || "";
    const receivableId = searchParams.get("receivableId") || "";
    const partyRefId = searchParams.get("partyRefId") || "";
    const status = searchParams.get("status") || ""; // "open" | "settled" | ""(all)
    const branchFilterObj = resolveBranchFilter(session, searchParams.get("branch") || "");
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const includeCancelled = searchParams.get("includeCancelled") === "true";
    let party = searchParams.get("party") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const meta = {};
    const key = cacheKey("finance", { route: "advances-list", ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 45, () => computeAdvancesList({
      account, direction, receivableId, partyRefId, status, branch, from, to, includeCancelled,
      party, page, limit,
    }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error listing advances:", error);
    return NextResponse.json({ error: "Failed to list advances" }, { status: 500 });
  }
}

async function computeAdvancesList({
  account, direction, receivableId, partyRefId, status, branch, from, to, includeCancelled,
  party, page, limit,
}) {
    // "Search employee" accepts a name or a staff employeeId code — resolve a code to the
    // matching employee's name so the label regex below still finds them.
    if (party) {
      const emp = await Employee.findOne({ employeeId: party }).select("name").lean();
      if (emp?.name) party = emp.name;
    }

    const match = {};
    if (!includeCancelled) match.isCancelled = { $ne: true };
    if (party) match["party.label"] = { $regex: party, $options: "i" };
    if (partyRefId && mongoose.Types.ObjectId.isValid(partyRefId)) {
      match["party.refId"] = new mongoose.Types.ObjectId(partyRefId);
    }
    if (account) match.account = account;
    if (direction && ["IN", "OUT"].includes(direction)) match.direction = direction;
    if (receivableId) match.receivableId = new mongoose.Types.ObjectId(receivableId);
    if (branch) match.branch = branch;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    // settled = advance applied against a payable (both legacy pair + settlements[] array).
    // cashRecovered = IN advances against this OUT advance's own receivable.
    // remaining = amount − settled − cashRecovered  (floored at 0).
    const computeStages = [
      {
        // Advance Type (e.g. "Advance Salary") lives on the backing Receivable's
        // revenueSubType, not on the Advance doc itself — join it in for display/export.
        $lookup: {
          from: Receivable.collection.name,
          localField: "receivableId",
          foreignField: "_id",
          as: "_receivable",
        },
      },
      { $addFields: { advanceType: { $arrayElemAt: ["$_receivable.revenueSubType", 0] } } },
      { $project: { _receivable: 0 } },
      {
        $lookup: {
          from: Advance.collection.name,
          let: { rid: "$receivableId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$receivableId", "$$rid"] },
                    { $eq: ["$direction", "IN"] },
                    { $ne: ["$isCancelled", true] },
                  ],
                },
              },
            },
            { $group: { _id: null, cash: { $sum: "$amount" } } },
          ],
          as: "_recovered",
        },
      },
      {
        $addFields: {
          settledTotal: { $round: [settledTotalExpr, 2] },
          cashRecovered: { $round: [{ $ifNull: [{ $arrayElemAt: ["$_recovered.cash", 0] }, 0] }, 2] },
        },
      },
      {
        $addFields: {
          remaining: {
            $round: [
              { $max: [{ $subtract: ["$amount", { $add: ["$settledTotal", "$cashRecovered"] }] }, 0] },
              2,
            ],
          },
        },
      },
      { $project: { _recovered: 0 } },
    ];

    const statusMatch =
      status === "open"
        ? [{ $match: { remaining: { $gt: 0.005 } } }]
        : status === "settled"
          ? [{ $match: { remaining: { $lte: 0.005 } } }]
          : [];

    const [rows, totalAgg] = await Promise.all([
      Advance.aggregate([
        { $match: match },
        ...computeStages,
        ...statusMatch,
        { $sort: { date: -1, createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
      Advance.aggregate([
        { $match: match },
        ...computeStages,
        ...statusMatch,
        { $count: "n" },
      ]),
    ]);

    const total = totalAgg?.[0]?.n || 0;

    return {
      success: true,
      advances: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
