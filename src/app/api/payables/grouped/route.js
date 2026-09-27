import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Payable, { PAYABLE_PURPOSE_VALUES, PAYABLE_KIND_VALUES } from "@/models/Payable";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions";
import { buildPayableGroupedStages, buildPayableAggregationStages } from "@/lib/payableAggregation";
import { unsettledMethodsSync } from "@/lib/masterData";
import { loadClosedPeriodSnapshot, blockReasonFromSnapshot } from "@/lib/periodLock";
import { resolveBranchFilter } from "@/lib/branches";
import { attachCollabPatients } from "@/lib/collabPatientLookup";
import { cacheKey, cached } from "@/lib/cache";


const ALLOWED_ROLES = ["admin", "super-admin", "owner"];

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
    const category = searchParams.get("category") || "";
    const subType = searchParams.get("subType") || "";
    const groupByParam = searchParams.get("groupBy");
    const groupBy = groupByParam === "vendor" ? "vendor" : groupByParam === "party" ? "party" : "category";
    const isParty = groupBy === "party";
    
    
    
    const subGroupBy = searchParams.get("subGroupBy") === "party" ? "party" : undefined;
    const subGroupByParty = subGroupBy === "party";
    const vendorId = searchParams.get("vendorId") || "";
    const branchFilterObj = resolveBranchFilter(session, searchParams.get("branch") || "");
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const party = searchParams.get("party") || "";
    const status = searchParams.get("status") || "";
    const ageing = searchParams.get("ageing") || "";
    const documentId = searchParams.get("documentId") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    
    
    const purposeList = (searchParams.get("purpose") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const badPurpose = purposeList.find((p) => !PAYABLE_PURPOSE_VALUES.includes(p));
    if (badPurpose) {
      return NextResponse.json(
        { error: `Unknown payable purpose "${badPurpose}"` },
        { status: 400 },
      );
    }
    const purpose = purposeList.length ? purposeList : undefined;

    const payeeKindParam = searchParams.get("payeeKind") || "";
    if (payeeKindParam && !PAYABLE_KIND_VALUES.includes(payeeKindParam)) {
      return NextResponse.json(
        { error: `Unknown payee kind "${payeeKindParam}"` },
        { status: 400 },
      );
    }
    const payeeKind = payeeKindParam || undefined;

    const meta = {};
    const key = cacheKey("finance", { route: "payables-grouped", ...Object.fromEntries(searchParams) }, session);
    let data;
    try {
      data = await cached(key, 45, () => computeGroupedPayables({
        level, category, subType, groupBy, isParty, subGroupBy, subGroupByParty, vendorId,
        branch, from, to, party, status, ageing, documentId, page, limit, purpose, payeeKind,
        searchParams,
      }), meta);
    } catch (err) {
      if (err instanceof Response) return err; 
      throw err;
    }
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error building grouped payables:", error);
    return NextResponse.json({ error: "Failed to load grouped payables" }, { status: 500 });
  }
}

async function computeGroupedPayables({
  level, category, subType, groupBy, isParty, subGroupBy, subGroupByParty, vendorId,
  branch, from, to, party, status, ageing, documentId, page, limit, purpose, payeeKind,
  searchParams,
}) {
    if (level < 3) {
      
      
      let partySearch = party;
      if (party) {
        const emp = await Employee.findOne({ employeeId: party }).select("name").lean();
        if (emp?.name) partySearch = emp.name;
      }
      const rows = await Payable.aggregate(
        buildPayableGroupedStages(Transactions.collection.name, {
          level,
          category,
          subType,
          branch,
          from,
          to,
          groupBy,
          subGroupBy,
          purpose,
          payeeKind,
          party: partySearch,
        }),
      );
      return { success: true, rows };
    }

    if (level === 4) {
      if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
        throw NextResponse.json({ error: "A valid documentId is required at level 4" }, { status: 400 });
      }
      const txMatch = {
        payableId: new mongoose.Types.ObjectId(documentId),
        approvalStatus: "APPROVED",
        method: { $nin: unsettledMethodsSync() },
      };
      if (from || to) {
        txMatch.date = {};
        if (from) txMatch.date.$gte = new Date(from);
        if (to) txMatch.date.$lte = new Date(to);
      }

      const [rows, total] = await Promise.all([
        Transactions.aggregate([
          { $match: txMatch },
          { $sort: { date: 1, _id: 1 } },
          {
            $setWindowFields: {
              sortBy: { date: 1, _id: 1 },
              output: {
                runningBalance: { $sum: "$amount", window: { documents: ["unbounded", "current"] } },
              },
            },
          },
          { $sort: { date: -1, _id: -1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              date: 1,
              narration: { $ifNull: [{ $ifNull: ["$remarks", "$expenseType"] }, "$expense"] },
              amount: 1,
              method: 1,
              account: "$furtherMode",
              runningBalance: 1,
              branch: 1,
              transactionCategory: 1,
              payableId: 1,
            },
          },
        ]),
        Transactions.countDocuments(txMatch),
      ]);

      const closedPeriods = await loadClosedPeriodSnapshot();
      const rowsWithLock = rows.map((r) => ({
        ...r,
        lockReason: blockReasonFromSnapshot(closedPeriods, r.account, r.date),
      }));

      return { success: true, rows: rowsWithLock, total, page, limit };
    }

    let match;
    if (groupBy === "vendor") {
      if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
        throw NextResponse.json({ error: "A valid vendorId is required at level 3 in vendor mode" }, { status: 400 });
      }
      match = { "payee.kind": "VENDOR", "payee.refId": new mongoose.Types.ObjectId(vendorId) };
    } else if (isParty) {
      if (!category) {
        throw NextResponse.json({ error: "party is required at level 3" }, { status: 400 });
      }
      
      match = { "payee.label": category };
    } else {
      if (!category) {
        throw NextResponse.json({ error: "category is required at level 3" }, { status: 400 });
      }
      match = { expenseCategory: category };
      if (subType) {
        if (subGroupByParty) match["payee.label"] = subType;
        else match.expenseSubType = subType;
      }
    }
    match.isCancelled = status === "Cancelled" ? true : { $ne: true };
    if (branch) match.branch = branch;
    if (party && !isParty && !subGroupByParty) match["payee.label"] = { $regex: party, $options: "i" };
    if (purpose) match.purpose = { $in: purpose };
    if (payeeKind && groupBy !== "vendor" && !isParty) match["payee.kind"] = payeeKind;
    
    const periodMonth = parseInt(searchParams.get("periodMonth") || "", 10);
    const periodYear = parseInt(searchParams.get("periodYear") || "", 10);
    if (Number.isInteger(periodMonth)) match["period.month"] = periodMonth;
    if (Number.isInteger(periodYear)) match["period.year"] = periodYear;
    
    
    if (from || to) {
      match.dueDate = {};
      if (from) match.dueDate.$gte = new Date(from);
      if (to) match.dueDate.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const stages = [
      { $match: match },
      ...buildPayableAggregationStages(Transactions.collection.name),
    ];
    if (status && status !== "Cancelled") stages.push({ $match: { status } });
    if (ageing) stages.push({ $match: { ageingBucket: ageing, pending: { $gt: 0 } } });
    stages.push({ $sort: { dueDate: 1, createdAt: -1 } });

    const [facet] = await Payable.aggregate([
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
    
    await attachCollabPatients(pageRows, "clinicSharePayable");
    const closedPeriods = await loadClosedPeriodSnapshot();
    const rows = pageRows.map((r) => ({
      ...r,
      lockReason: blockReasonFromSnapshot(closedPeriods, null, r.dueDate || r.createdAt || new Date()),
    }));

    
    const empRefIds = [
      ...new Set(
        rows
          .filter((r) => r.payee?.kind === "EMPLOYEE" && r.payee?.refId)
          .map((r) => String(r.payee.refId)),
      ),
    ];
    if (empRefIds.length) {
      const emps = await Employee.find(
        { _id: { $in: empRefIds.map((id) => new mongoose.Types.ObjectId(id)) } },
        { employeeId: 1 },
      ).lean();
      const codeById = new Map(emps.map((e) => [String(e._id), e.employeeId || ""]));
      rows.forEach((r) => {
        if (r.payee?.kind === "EMPLOYEE") r.payeeCode = codeById.get(String(r.payee.refId)) || "";
      });
    }

    return { success: true, rows, total, page, limit };
}
