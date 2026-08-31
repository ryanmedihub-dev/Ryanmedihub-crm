import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";

const ALLOWED_ROLES = ["admin", "super-admin"];

/**
 * Per-employee payable rollup for the staff table's money columns.
 *
 * All six figures come from the same source — Payables raised against the employee —
 * so they reconcile with each other and with the payables pages:
 *     Total Payable = Salary Payable + Incentive Payable + everything else
 *     Pending       = Payable − Paid
 *
 * `paid` comes from buildPayableAggregationStages, so it counts settlement by transaction,
 * borrowing and applied advance alike — the same definition the Payables Report uses.
 */
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

    const match = {
      "payee.kind": "EMPLOYEE",
      "payee.refId": { $ne: null },
      isCancelled: { $ne: true },
    };
    if (branch) match.branch = branch;
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

    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const byEmployee = {};
    for (const r of rows) {
      byEmployee[String(r._id)] = {
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

    return NextResponse.json({ success: true, byEmployee, employeeCount: rows.length });
  } catch (error) {
    console.error("Error building employee finance summary:", error);
    return NextResponse.json({ error: "Failed to build employee finance summary" }, { status: 500 });
  }
}
