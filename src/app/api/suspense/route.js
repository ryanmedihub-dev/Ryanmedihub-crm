import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import SuspenseEntry from "@/models/SuspenseEntry";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES, resolveBranchFilter } from "@/lib/branches";
import { cacheInvalidate } from "@/lib/cache";

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
    const status = searchParams.get("status") || "open";
    const account = searchParams.get("account") || "";
    const branchFilterObj = resolveBranchFilter(session, searchParams.get("branch") || "");
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const groupBy = searchParams.get("groupBy") || "";
    const accountsParam = searchParams.get("accounts") || "";

    if (groupBy === "account") {
      const groupMatch = { isCancelled: { $ne: true } };
      if (status === "open") groupMatch.isResolved = { $ne: true };
      else if (status === "resolved") groupMatch.isResolved = true;
      if (branch) groupMatch.branch = branch;
      if (accountsParam) groupMatch.account = { $in: accountsParam.split(",") };
      if (from || to) {
        groupMatch.date = {};
        if (from) groupMatch.date.$gte = new Date(from);
        if (to) groupMatch.date.$lte = new Date(`${to}T23:59:59.999Z`);
      }
      const grouped = await SuspenseEntry.aggregate([
        { $match: groupMatch },
        {
          $group: {
            _id: "$account",
            movement: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] } },
            settled: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      const rows = grouped.map((g) => ({
        key: g._id,
        label: g._id,
        opening: 0,
        movement: Math.round((g.movement || 0) * 100) / 100,
        settled: Math.round((g.settled || 0) * 100) / 100,
        closing: Math.round(((g.movement || 0) - (g.settled || 0)) * 100) / 100,
        count: g.count,
      }));
      return NextResponse.json({ success: true, rows });
    }

    const match = { isCancelled: { $ne: true } };
    if (status === "open") match.isResolved = { $ne: true };
    else if (status === "resolved") match.isResolved = true;
    if (account) match.account = account;
    if (branch) match.branch = branch;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [rows, total, openAgg] = await Promise.all([
      SuspenseEntry.find(match)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("resolvedTransactionId", "amount date transactionCategory procedure patientName")
        .lean(),
      SuspenseEntry.countDocuments(match),
      SuspenseEntry.aggregate([
        { $match: { isResolved: { $ne: true }, isCancelled: { $ne: true } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            netAmount: {
              $sum: {
                $cond: [{ $eq: ["$direction", "OUT"] }, { $multiply: ["$amount", -1] }, "$amount"],
              },
            },
          },
        },
      ]),
    ]);

    return NextResponse.json({
      success: true,
      entries: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      openSummary: {
        count: openAgg[0]?.count || 0,
        netAmount: Math.round((openAgg[0]?.netAmount || 0) * 100) / 100,
      },
    });
  } catch (error) {
    console.error("Error listing suspense entries:", error);
    return NextResponse.json({ error: "Failed to list suspense entries" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { account, direction, amount, date, branch, reference, remarks, receipts } =
      await req.json();

    if (!accountsSync().includes(account)) {
      return NextResponse.json(
        { error: `account must be one of: ${accountsSync().join(", ")}` },
        { status: 400 },
      );
    }
    if (direction && !["IN", "OUT"].includes(direction)) {
      return NextResponse.json({ error: "direction must be IN or OUT" }, { status: 400 });
    }
    const parsedAmount = parseFloat(amount);
    if (!(parsedAmount > 0)) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }
    if (branch && !ALL_BRANCHES.includes(branch)) {
      return NextResponse.json(
        { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` },
        { status: 400 },
      );
    }

    const entry = new SuspenseEntry({
      account,
      direction: direction || "IN",
      amount: parsedAmount,
      date: date ? new Date(date) : new Date(),
      branch: branch || null,
      reference: reference || "",
      remarks: remarks || "",
      receipts: Array.isArray(receipts) ? receipts : [],
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    });
    entry.log.push({
      action: "Created",
      newValue: String(parsedAmount),
      note: `Unexplained ${direction === "OUT" ? "debit from" : "credit to"} ${account}`,
      performedBy: { name: session.user.name, email: session.user.email },
      performedAt: new Date(),
    });

    await entry.save();

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Suspense entry recorded", entry }, { status: 201 });
  } catch (error) {
    if (error?.name === "ValidationError" || error?.message?.includes("Suspense")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating suspense entry:", error);
    return NextResponse.json({ error: "Failed to create suspense entry" }, { status: 500 });
  }
}
