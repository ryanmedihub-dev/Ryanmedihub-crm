import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Borrowing from "@/models/Borrowing";
import { resolveBranchFilter } from "@/lib/branches";
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
    const payableId = searchParams.get("payableId") || "";
    const branchFilterObj = resolveBranchFilter(session, searchParams.get("branch") || "");
    const branch = typeof branchFilterObj.branch === "string" ? branchFilterObj.branch : "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const includeCancelled = searchParams.get("includeCancelled") === "true";
    const party = searchParams.get("party") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const meta = {};
    const key = cacheKey("finance", { route: "borrowings-list", ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 45, () => computeBorrowingsList({
      account, direction, payableId, branch, from, to, includeCancelled, party, page, limit,
    }), meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error listing borrowings:", error);
    return NextResponse.json({ error: "Failed to list borrowings" }, { status: 500 });
  }
}

async function computeBorrowingsList({ account, direction, payableId, branch, from, to, includeCancelled, party, page, limit }) {
    const match = {};
    if (!includeCancelled) match.isCancelled = { $ne: true };
    if (party) match["party.label"] = { $regex: party, $options: "i" };
    if (account) match.account = account;
    if (direction && ["IN", "OUT"].includes(direction)) match.direction = direction;
    if (payableId) match.payableId = payableId;
    if (branch) match.branch = branch;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [rows, total] = await Promise.all([
      Borrowing.find(match)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("payableId", "expenseSubType totalAmount")
        .lean(),
      Borrowing.countDocuments(match),
    ]);

    return {
      success: true,
      borrowings: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
