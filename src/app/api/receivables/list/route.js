import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { AGEING_SORT } from "@/lib/ageing";
import { resolveBranchFilter } from "@/lib/branches";

const ALLOWED_ROLES = ["admin", "super-admin"];

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
    const purpose = searchParams.get("purpose") || "";
    const payerKind = searchParams.get("payerKind") || "";
    const payerRefId = searchParams.get("payerRefId") || "";
    const payerLabel = searchParams.get("payerLabel") || "";
    const revenueCategory = searchParams.get("revenueCategory") || "";
    const revenueSubType = searchParams.get("revenueSubType") || "";
    const status = searchParams.get("status") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const search = searchParams.get("search") || "";
    const includeCancelled = searchParams.get("includeCancelled") === "true";
    const ageingBucket = searchParams.get("ageingBucket") || "";
    const outstandingOnly = searchParams.get("outstanding") === "true";
    const sort = searchParams.get("sort") || "";

    const match = {};
    if (!includeCancelled) match.isCancelled = false;
    if (purpose) match.purpose = purpose;
    if (payerKind) match["payer.kind"] = payerKind;
    if (payerRefId) match["payer.refId"] = new mongoose.Types.ObjectId(payerRefId);
    if (payerLabel) match["payer.label"] = payerLabel;
    if (revenueCategory) match.revenueCategory = revenueCategory;
    if (revenueSubType) match.revenueSubType = revenueSubType;
    Object.assign(match, resolveBranchFilter(session, searchParams.get("branch") || ""));
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
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      match.$or = [
        { "payer.label": searchRegex },
        { revenueCategory: searchRegex },
        { remarks: searchRegex },
      ];
    }

    const txCollection = Transactions.collection.name;
    const basePipeline = [{ $match: match }, ...buildReceivableAggregationStages(txCollection)];
    if (status) basePipeline.push({ $match: { status } });
    if (outstandingOnly) basePipeline.push({ $match: { pending: { $gt: 0 } } });
    if (ageingBucket) basePipeline.push({ $match: { ageingBucket, pending: { $gt: 0 } } });
    basePipeline.push({ $sort: sort === "createdAt" ? { createdAt: -1 } : AGEING_SORT });

    const [rows, totalAgg] = await Promise.all([
      Receivable.aggregate([
        ...basePipeline,
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
      Receivable.aggregate([...basePipeline, { $count: "total" }]),
    ]);

    return NextResponse.json({
      success: true,
      receivables: rows,
      total: totalAgg[0]?.total || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error listing receivables:", error);
    return NextResponse.json({ error: "Failed to fetch receivables" }, { status: 500 });
  }
}
