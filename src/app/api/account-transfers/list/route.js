import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import AccountTransfer from "@/models/AccountTransfer";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";

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
    const account = searchParams.get("account") || "";
    const branch = searchParams.get("branch") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const includeCancelled = searchParams.get("includeCancelled") === "true";
    const onlyCancelled = searchParams.get("onlyCancelled") === "true";

    const match = {};
    if (onlyCancelled) match.isCancelled = true;
    else if (!includeCancelled) match.isCancelled = { $ne: true };
    if (branch) {
      if (!ALL_BRANCHES.includes(branch)) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      match.branch = branch;
    }
    if (account) {
      if (!accountsSync().includes(account)) {
        return NextResponse.json({ error: "Invalid account" }, { status: 400 });
      }
      match.$or = [{ fromAccount: account }, { toAccount: account }];
    }
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    const [transfers, total] = await Promise.all([
      AccountTransfer.find(match)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AccountTransfer.countDocuments(match),
    ]);

    return NextResponse.json({ success: true, transfers, total, page, limit });
  } catch (error) {
    console.error("Error listing contra entries:", error);
    return NextResponse.json({ error: "Failed to fetch contra entries" }, { status: 500 });
  }
}
