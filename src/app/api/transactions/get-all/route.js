import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import { resolveBranchFilter } from "@/lib/branches";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync, nonCashMethodsSync } from "@/lib/masterData";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";
import { cacheKey, cached } from "@/lib/cache";

function deriveEntryType(tx) {
  if (tx.reversalOf) return "REVERSAL";
  if (tx.isSettlement) {
    return tx.costType === "Revenue" ? "RECEIPT_SETTLEMENT" : "PAYMENT_SETTLEMENT";
  }
  if (unsettledMethodsSync().includes(tx.method)) {
    return tx.costType === "Revenue" ? "EXTERNAL_RECEIPT" : "EXTERNAL_PAYMENT";
  }
  if (nonCashMethodsSync().includes(tx.method)) return "NON_CASH";
  return "REGULAR";
}
import "@/models/Stock";
import "@/models/Vendor";
import "@/models/Employee";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const UNTRACKED_FURTHER_MODE = "__UNTRACKED__";


const listParam = (raw) => [
  ...new Set(
    (raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];


const ciInClause = (values) => ({
  $in: values.map((v) => new RegExp(`^${escapeRegex(v)}$`, "i")),
});


const entryTypeClause = (t) => {
  if (t === "REGULAR")
    return { isSettlement: { $ne: true }, reversalOf: null, method: { $nin: unsettledMethodsSync() } };
  if (t === "SETTLEMENT") return { isSettlement: true };
  if (t === "EXTERNAL") return { method: { $in: unsettledMethodsSync() } };
  if (t === "REVERSAL") return { reversalOf: { $ne: null } };
  return null;
};

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized. Please login." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page          = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit         = Math.min(10000, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const category      = searchParams.get("category")      || "";
    const dateFrom      = searchParams.get("dateFrom")      || "";
    const dateTo        = searchParams.get("dateTo")        || "";
    const search        = searchParams.get("search")        || "";
    const approvalStatus = searchParams.get("approvalStatus") || "";
    const payableId      = searchParams.get("payableId")      || "";
    const receivableId   = searchParams.get("receivableId")   || "";
    const patientId      = searchParams.get("patient")        || "";
    const sortKey       = searchParams.get("sortKey")       || "date";
    const sortDir       = searchParams.get("sortDir") === "asc" ? 1 : -1;

    
    const branches        = listParam(searchParams.get("branch"));
    const paymentMethods  = listParam(searchParams.get("paymentMethod"));
    const procedures      = listParam(searchParams.get("procedure"));
    const furtherModes    = listParam(searchParams.get("furtherMode"));
    const expenseCategories = listParam(searchParams.get("expenseCategory"));
    const expenseTypes    = listParam(searchParams.get("expenseType"));
    const entryTypes      = listParam(searchParams.get("entryType"));

    await connectDB();

    const meta = {};
    const key = cacheKey("finance", { route: "transactions-get-all", ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 30, () => computeTransactionsGetAll({
      session, page, limit, category, dateFrom, dateTo, search, approvalStatus, payableId,
      receivableId, patientId, sortKey, sortDir, branches, paymentMethods, procedures,
      furtherModes, expenseCategories, expenseTypes, entryTypes,
    }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("❌ Error fetching all transactions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions", message: error.message },
      { status: 500 }
    );
  }
}

async function computeTransactionsGetAll({
  session, page, limit, category, dateFrom, dateTo, search, approvalStatus, payableId,
  receivableId, patientId, sortKey, sortDir, branches, paymentMethods, procedures,
  furtherModes, expenseCategories, expenseTypes, entryTypes,
}) {
    const branchFilter = resolveBranchFilter(
      session,
      branches.length === 1 ? branches[0] : "",
    );

    const query = { ...branchFilter };

    
    
    if (branches.length > 1) {
      const allowed = branchFilter.branch;
      if (allowed && Array.isArray(allowed.$in)) {
        query.branch = { $in: branches.filter((b) => allowed.$in.includes(b)) };
      } else if (typeof allowed === "string") {
        
      } else {
        query.branch = { $in: branches };
      }
    }

    if (payableId) {
      query.payableId = payableId;
    }

    if (receivableId) {
      query.receivableId = receivableId;
    }

    
    
    if (patientId && mongoose.Types.ObjectId.isValid(patientId)) {
      query.patient = new mongoose.Types.ObjectId(patientId);
    }

    if (category && category !== "ALL") {
      if (category === "TRANSPLANT") {
        query.$or = [
          { transactionCategory: "TRANSPLANT" },
          { transactionCategory: { $in: [null, "", undefined] } },
          { transactionCategory: { $exists: false } },
        ];
      } else {
        query.transactionCategory = category;
      }
    }

    if (approvalStatus === "PENDING" || approvalStatus === "REJECTED") {
      query.approvalStatus = approvalStatus;
    } else {
      query.approvalStatus = { $nin: ["PENDING", "REJECTED"] };
    }

    if (dateFrom || dateTo) {
      
      
      
      query.date = {};
      if (dateFrom) query.date.$gte = getISTStartOfDay(dateFrom);
      if (dateTo) query.date.$lte = getISTEndOfDay(dateTo);
    }

    if (paymentMethods.length) {
      query.method = ciInClause(paymentMethods);
    }

    if (procedures.length) {
      query.procedure = ciInClause(procedures);
    }

    if (furtherModes.length) {
      const wantsUntracked = furtherModes.includes(UNTRACKED_FURTHER_MODE);
      const named = furtherModes.filter((m) => m !== UNTRACKED_FURTHER_MODE);
      const parts = [];
      if (named.length) parts.push(...ciInClause(named).$in);
      if (wantsUntracked) parts.push("", null);
      query.furtherMode = { $in: parts };
    }

    if (expenseCategories.length) {
      query.expense = ciInClause(expenseCategories);
    }
    if (expenseTypes.length) {
      query.expenseType = ciInClause(expenseTypes);
    }

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };

      const matchingPatients = await Patient.find(
        { $or: [{ "personal.name": searchRegex }, { "personal.phone": searchRegex }] },
        { _id: 1 }
      ).lean();
      const patientIds = matchingPatients.map((p) => p._id);

      const searchClause = [
        { patientName: searchRegex },
        { patientPhone: searchRegex },
        { paymentId: searchRegex },
        { branch: searchRegex },
        { method: searchRegex },
        { remarks: searchRegex },
        { procedure: searchRegex },
        { expense: searchRegex },
        { expenseCategory: searchRegex },
        ...(patientIds.length ? [{ patient: { $in: patientIds } }] : []),
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchClause }];
        delete query.$or;
      } else {
        query.$or = searchClause;
      }
    }

    const entryClauses = entryTypes
      .map((t) => entryTypeClause(t))
      .filter(Boolean);
    if (entryClauses.length === 1) {
      query.$and = [...(query.$and || []), entryClauses[0]];
    } else if (entryClauses.length > 1) {
      query.$and = [...(query.$and || []), { $or: entryClauses }];
    }

    const statsQuery = {
      ...branchFilter,
      ...SETTLEMENT_EXCLUSION,
      approvalStatus: { $nin: ["PENDING", "REJECTED"] },
    };
    if (query.branch)      statsQuery.branch = query.branch;
    if (query.date)        statsQuery.date   = query.date;
    if (query.procedure)   statsQuery.procedure = query.procedure;
    if (query.furtherMode) statsQuery.furtherMode = query.furtherMode;
    if (query.expense)     statsQuery.expense = query.expense;
    if (query.expenseType) statsQuery.expenseType = query.expenseType;
    statsQuery.$and = [
      { method: { $nin: unsettledMethodsSync() } },
      ...(query.method ? [{ method: query.method }] : []),
    ];

    const allowedSortKeys = new Set(["date", "amount", "method", "branch", "procedure", "patientName"]);
    const safeSortKey = allowedSortKeys.has(sortKey) ? sortKey : "date";

    const [transactions, total, statsAgg] = await Promise.all([
      Transactions.find(query)
        .populate({
          path: "patient",
          select: "personal.name personal.phone payments counselling.counsellor",
          populate: { path: "counselling.counsellor", select: "name" },
        })
        .populate("medicineId", "name")
        .populate("expenseGiver.vendorId", "name contact")
        .sort({ [safeSortKey]: sortDir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Transactions.countDocuments(query),

      Transactions.aggregate([
        { $match: statsQuery },
        {
          $group: {
            _id: { $ifNull: ["$transactionCategory", "TRANSPLANT"] },
            count: { $sum: 1 },
            total: { $sum: { $toDouble: "$amount" } },
          },
        },
      ]),
    ]);

    const stats = {
      TRANSPLANT: { count: 0, total: 0 },
      SERVICE:    { count: 0, total: 0 },
      MEDICINE:   { count: 0, total: 0 },
      EXPENSE:    { count: 0, total: 0 },
    };
    for (const { _id, count, total: t } of statsAgg) {
      const cat = _id || "TRANSPLANT";
      if (stats[cat]) { stats[cat].count = count; stats[cat].total = t; }
    }

    const mappedTransactions = transactions.map((tx) => ({
      ...tx,
      transactionCategory: tx.transactionCategory || tx.category,
      entryType: deriveEntryType(tx),
      linkedDocId:
        tx.receivableId ||
        tx.payableId ||
        tx.externalParty?.linkedReceivableId ||
        tx.externalParty?.linkedPayableId ||
        null,
      linkedDocType:
        tx.receivableId || tx.externalParty?.linkedReceivableId
          ? "RECEIVABLE"
          : tx.payableId || tx.externalParty?.linkedPayableId
            ? "PAYABLE"
            : null,
    }));

    return {
      success: true,
      transactions: mappedTransactions,
      total,
      page,
      limit,
      stats,
    };
}
