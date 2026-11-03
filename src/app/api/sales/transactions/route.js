import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Transactions from "@/models/Transactions";
import { requireSession, resolveBranchScope } from "@/lib/apiGuard";

const ALLOWED_ROLES = ["super-admin", "admin", "sales", "owner"];

const handler = async (req) => {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const requestedBranch = searchParams.get("branch");
    const branchFilter = resolveBranchScope(session, requestedBranch, "branch");

    const query = { costType: "Revenue", ...branchFilter };

    const [transactions, total] = await Promise.all([
      Transactions.find(query)
        .populate({
          path: "patient",
          select: "personal.name personal.phone personal.branch personal.email",
        })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transactions.countDocuments(query),
    ]);

    const revenueData = transactions.map((transaction) => ({
      _id: transaction._id,
      patient: transaction.patient,
      branch: transaction.branch,
      procedure: transaction.procedure,
      paymentType: transaction.paymentType,
      method: transaction.method,
      amount: transaction.amount,
      date: transaction.date,
      remarks: transaction.remarks,
      costType: transaction.costType,
      createdAt: transaction.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: revenueData,
      count: revenueData.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Error fetching sales transactions:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch transactions",
        message: error.message,
      },
      { status: 500 }
    );
  }
};

export const GET = withDB(handler);