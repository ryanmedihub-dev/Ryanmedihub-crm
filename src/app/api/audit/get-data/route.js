import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Audit from "@/models/Audit";
import { resolveDateRange, toDateQuery } from "@/lib/dateHelpers";
import { requireAdmin, resolveBranchScope } from "@/lib/apiGuard";

const MAX_ROWS = 2000;

const handler = async (req) => {
  const { session, error: authError } = await requireAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);

  const dateRange = resolveDateRange(searchParams);
  const dateQuery = toDateQuery(dateRange);
  const query = dateQuery ? { date: dateQuery } : {};

  const requestedBranch = searchParams.get("branch");
  const branchFilter = resolveBranchScope(session, requestedBranch, "branch");
  Object.assign(query, branchFilter);

  const data = await Audit.find(query)
    .select(
      "costType patient branch procedure paymentType paymentId expense expenseType method amount discount date remarks createdBy editors",
    )
    .populate({
      path: "patient",
      select:
        "personal.name personal.phone surgery.technique payments.totalAmount payments.amountReceived payments.pendingAmount payments.medicineAmount payments.discount createdAt",
      options: { sort: { createdAt: -1 } },
    })
    .sort({ date: -1 })
    .limit(MAX_ROWS + 1)
    .lean();

  const truncated = data.length > MAX_ROWS;
  const rows = truncated ? data.slice(0, MAX_ROWS) : data;

  const finaldata = rows.reduce((acc, transaction) => {
    const type = transaction.costType || "other";

    if (!acc[type]) {
      acc[type] = [];
    }

    acc[type].push({
      _id: transaction._id,
      patient: transaction.patient,
      branch: transaction.branch,
      procedure: transaction.procedure,
      paymentType: transaction.paymentType,
      paymentId: transaction.paymentId,
      expense: transaction.expense,
      expenseType: transaction.expenseType,
      method: transaction.method,
      amount: transaction.amount,
      discount: transaction.discount || 0,
      date: transaction.date,
      remarks: transaction.remarks,
      createdBy: transaction.createdBy || null,
      editors: transaction.editors || [],
      totalEdits: transaction.editors?.length || 0,
      lastEditedBy:
        transaction.editors?.length > 0
          ? transaction.editors[transaction.editors.length - 1]
          : null,
    });

    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    data: finaldata,
    types: Object.keys(finaldata),
    truncated,
    dateWindow: {
      from: dateRange.start ? dateRange.start.toISOString() : null,
      to: dateRange.end ? dateRange.end.toISOString() : null,
      isDefault: dateRange.isDefault,
      isAll: dateRange.isAll,
    },
  });
};

export const GET = withDB(handler);
