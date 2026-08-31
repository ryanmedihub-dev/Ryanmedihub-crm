import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import CollabCase from "@/models/CollabCase";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { COLLAB_BRANCHES } from "@/lib/branches";

const ALLOWED_ROLES = ["collab", "admin", "super-admin"];

/**
 * Fills in payableValue / receivableValue on each case from the Payable / Receivable it
 * crystallised into, using the same aggregation the balances endpoint and the
 * assets/liabilities pages use — so a case row and the clinic total above it can't drift.
 * Cases that haven't crystallised yet get null, which the UI renders as "—".
 */
async function attachSettlementValues(rows, txCollection) {
  const payableIds = rows.map((r) => r.clinicSharePayable).filter(Boolean);
  const receivableIds = rows.map((r) => r.clinicShareReceivable).filter(Boolean);

  const [payables, receivables] = await Promise.all([
    payableIds.length
      ? Payable.aggregate([
          { $match: { _id: { $in: payableIds } } },
          ...buildPayableAggregationStages(txCollection),
          { $project: { pending: 1, totalAmount: 1, paid: 1, status: 1 } },
        ])
      : [],
    receivableIds.length
      ? Receivable.aggregate([
          { $match: { _id: { $in: receivableIds } } },
          ...buildReceivableAggregationStages(txCollection),
          { $project: { pending: 1, totalAmount: 1, received: 1, status: 1 } },
        ])
      : [],
  ]);

  const payableBy = new Map(payables.map((p) => [String(p._id), p]));
  const receivableBy = new Map(receivables.map((r) => [String(r._id), r]));

  for (const row of rows) {
    const p = row.clinicSharePayable ? payableBy.get(String(row.clinicSharePayable)) : null;
    const r = row.clinicShareReceivable ? receivableBy.get(String(row.clinicShareReceivable)) : null;

    row.payableValue = p ? p.pending : null;
    row.payableTotal = p ? p.totalAmount : null;
    row.payableStatus = p ? p.status : null;
    row.receivableValue = r ? r.pending : null;
    row.receivableTotal = r ? r.totalAmount : null;
    row.receivableStatus = r ? r.status : null;
  }
}

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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const clinic = searchParams.get("clinic") || "";
    const status = searchParams.get("status") || "";
    const patient = searchParams.get("patient") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const search = searchParams.get("search") || "";

    const match = { clinic: { $in: COLLAB_BRANCHES } };
    if (clinic) {
      if (!COLLAB_BRANCHES.includes(clinic)) {
        return NextResponse.json({ error: "Invalid clinic" }, { status: 400 });
      }
      match.clinic = clinic;
    }
    if (status) match.status = status;
    if (patient) match.patient = new mongoose.Types.ObjectId(patient);
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

    const txCollection = Transactions.collection.name;
    const patientCollection = Patient.collection.name;

    const basePipeline = [
      { $match: match },
      {
        $lookup: {
          from: txCollection,
          let: { caseId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$collabRef.caseId", "$$caseId"] },
                    { $eq: ["$costType", "Revenue"] },
                    { $not: [{ $in: ["$approvalStatus", ["PENDING", "REJECTED"]] }] },
                    { $eq: [{ $ifNull: ["$receivableId", null] }, null] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                ourReceived: {
                  $sum: { $cond: [{ $ne: ["$method", "paid_to_external"] }, "$amount", 0] },
                },
                clinicReceived: {
                  $sum: { $cond: [{ $eq: ["$method", "paid_to_external"] }, "$amount", 0] },
                },
                totalDiscount: { $sum: { $ifNull: ["$discount", 0] } },
              },
            },
          ],
          as: "revenueAgg",
        },
      },
      {
        $lookup: {
          from: patientCollection,
          localField: "patient",
          foreignField: "_id",
          as: "patientDoc",
        },
      },
      {
        $addFields: {
          collectedByUs: { $ifNull: [{ $arrayElemAt: ["$revenueAgg.ourReceived", 0] }, 0] },
          collectedByClinic: { $ifNull: [{ $arrayElemAt: ["$revenueAgg.clinicReceived", 0] }, 0] },
          totalDiscount: { $ifNull: [{ $arrayElemAt: ["$revenueAgg.totalDiscount", 0] }, 0] },
          patientInfo: { $arrayElemAt: ["$patientDoc", 0] },
        },
      },
      {
        $addFields: {
          // Case-scoped figure, kept because the collection modal caps against it.
          caseOutstanding: {
            $subtract: [
              "$packageAmount",
              { $add: ["$collectedByUs", "$collectedByClinic", "$totalDiscount"] },
            ],
          },
          caseNet: { $subtract: ["$collectedByClinic", "$clinicShare"] },
          patientName: "$patientInfo.personal.name",
          patientPhone: "$patientInfo.personal.phone",
          paidToClinic: "$collectedByClinic",
          // The patient's own ledger — what the Package and Outstanding columns show.
          // Note this is patient-level, so a patient with several cases repeats it.
          patientPackage: { $ifNull: ["$patientInfo.payments.totalAmount", 0] },
          patientOutstanding: { $ifNull: ["$patientInfo.payments.pendingAmount", 0] },
          patientReceived: { $ifNull: ["$patientInfo.payments.amountReceived", 0] },
          patientDiscount: { $ifNull: ["$patientInfo.payments.discount", 0] },
        },
      },
      { $project: { revenueAgg: 0, patientDoc: 0, patientInfo: 0 } },
    ];

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      basePipeline.push({
        $match: {
          $or: [
            { patientName: searchRegex },
            { patientPhone: searchRegex },
            { remarks: searchRegex },
          ],
        },
      });
    }

    basePipeline.push({ $sort: { createdAt: -1 } });

    const [rows, totalAgg] = await Promise.all([
      CollabCase.aggregate([...basePipeline, { $skip: (page - 1) * limit }, { $limit: limit }]),
      CollabCase.aggregate([...basePipeline, { $count: "total" }]),
    ]);

    const leaked = rows.filter((r) => !COLLAB_BRANCHES.includes(r.clinic));
    if (leaked.length > 0) {
      console.error("Collab case query returned non-collab-branch rows:", leaked.map((r) => r._id));
    }

    // Live pending on the payable/receivable each case crystallised into — what is actually
    // still on the books, and what the clinic totals on this page are built from. Resolved
    // for just this page's ids so the heavy settlement pipelines run over a handful of docs.
    await attachSettlementValues(rows, txCollection);

    // A patient can hold several collab cases; the Package / Outstanding columns are
    // patient-level, so flag every repeat after the first to stop them being summed twice.
    const seenPatients = new Set();
    for (const r of rows) {
      const key = String(r.patient || "");
      r.patientFigureRepeated = key ? seenPatients.has(key) : false;
      if (key) seenPatients.add(key);
    }

    return NextResponse.json({
      success: true,
      cases: rows,
      total: totalAgg[0]?.total || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error listing collab cases:", error);
    return NextResponse.json({ error: "Failed to fetch collab cases" }, { status: 500 });
  }
}
