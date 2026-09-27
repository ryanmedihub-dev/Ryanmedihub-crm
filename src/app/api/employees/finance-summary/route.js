import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Payable from "@/models/Payable";
import Advance from "@/models/Advance";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { settledTotalExpr } from "@/lib/advanceSettlements";

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
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const branch = searchParams.get("branch") || "";
    const employeeId = searchParams.get("employeeId") || "";

    const match = {
      "payee.kind": "EMPLOYEE",
      "payee.refId": { $ne: null },
      isCancelled: { $ne: true },
    };
    if (branch) match.branch = branch;
    
    
    if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
      match["payee.refId"] = new mongoose.Types.ObjectId(employeeId);
    }
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        match.createdAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        match.createdAt.$lte = to;
      }
    }

    const forPurpose = (purpose, field) => ({
      $sum: { $cond: [{ $eq: ["$purpose", purpose] }, `$${field}`, 0] },
    });

    const rows = await Payable.aggregate([
      { $match: match },
      ...buildPayableAggregationStages(Transactions.collection.name),
      {
        $group: {
          _id: "$payee.refId",
          totalPayable: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paid" },
          totalPending: { $sum: "$pending" },
          salaryPayable: forPurpose("SALARY", "totalAmount"),
          salaryPaid: forPurpose("SALARY", "paid"),
          salaryPending: forPurpose("SALARY", "pending"),
          incentivePayable: forPurpose("INCENTIVE", "totalAmount"),
          incentivePaid: forPurpose("INCENTIVE", "paid"),
          incentivePending: forPurpose("INCENTIVE", "pending"),
          payableCount: { $sum: 1 },
          overdueCount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$pending", 0] }, { $gt: ["$daysOverdue", 0] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    
    
    
    const advMatch = {
      "party.kind": "EMPLOYEE",
      "party.refId": { $ne: null },
      isCancelled: { $ne: true },
    };
    if (branch) advMatch.branch = branch;
    if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
      advMatch["party.refId"] = new mongoose.Types.ObjectId(employeeId);
    }

    const advRows = await Advance.aggregate([
      { $match: advMatch },
      {
        $group: {
          _id: "$party.refId",
          advanceGiven: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] } },
          advanceRecovered: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$amount", 0] } },
          advanceSettled: {
            $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, settledTotalExpr, 0] },
          },
          advanceCount: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, 1, 0] } },
        },
      },
    ]);

    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const blank = () => ({
      totalPayable: 0, totalPaid: 0, totalPending: 0,
      salaryPayable: 0, salaryPaid: 0, salaryPending: 0,
      incentivePayable: 0, incentivePaid: 0, incentivePending: 0,
      payableCount: 0, overdueCount: 0,
      advanceGiven: 0, advanceSettled: 0, advanceRecovered: 0, advanceOutstanding: 0, advanceCount: 0,
    });

    const byEmployee = {};
    for (const r of rows) {
      byEmployee[String(r._id)] = {
        ...blank(),
        totalPayable: round2(r.totalPayable),
        totalPaid: round2(r.totalPaid),
        totalPending: round2(r.totalPending),
        salaryPayable: round2(r.salaryPayable),
        salaryPaid: round2(r.salaryPaid),
        salaryPending: round2(r.salaryPending),
        incentivePayable: round2(r.incentivePayable),
        incentivePaid: round2(r.incentivePaid),
        incentivePending: round2(r.incentivePending),
        payableCount: r.payableCount || 0,
        overdueCount: r.overdueCount || 0,
      };
    }
    for (const a of advRows) {
      const key = String(a._id);
      const row = byEmployee[key] || (byEmployee[key] = blank());
      row.advanceGiven = round2(a.advanceGiven);
      row.advanceSettled = round2(a.advanceSettled);
      row.advanceRecovered = round2(a.advanceRecovered);
      row.advanceOutstanding = Math.max(0, round2(a.advanceGiven - a.advanceSettled - a.advanceRecovered));
      row.advanceCount = a.advanceCount || 0;
    }

    return NextResponse.json({
      success: true,
      byEmployee,
      employeeCount: Object.keys(byEmployee).length,
    });
  } catch (error) {
    console.error("Error building employee finance summary:", error);
    return NextResponse.json({ error: "Failed to build employee finance summary" }, { status: 500 });
  }
}
