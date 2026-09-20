import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import AccountPeriod, { isOpeningSeed } from "@/models/AccountPeriod";
import { recomputeChain } from "@/lib/accountPeriods";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["super-admin"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json(
        { error: "Forbidden — only a super-admin can reopen a closed period." },
        { status: 403 },
      );
    }

    await connectDB();

    const { periodId, account, from, to, reason } = await req.json();

    if (!reason || !String(reason).trim()) {
      return NextResponse.json(
        { error: "A reason is required to reopen a closed period." },
        { status: 400 },
      );
    }

    const query = periodId
      ? { _id: periodId }
      : { account, branch: null, periodStart: new Date(from), periodEnd: new Date(to) };
    const period = await AccountPeriod.findOne(query);

    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }
    if (!period.isClosed) {
      return NextResponse.json({ error: "That period is already open." }, { status: 400 });
    }
    if (isOpeningSeed(period)) {
      return NextResponse.json(
        { error: "That is a manually-entered opening balance, not a closed period." },
        { status: 400 },
      );
    }

    const actor = { name: session.user.name, email: session.user.email };
    const trimmedReason = String(reason).trim();
    const previousClosing = period.closingBalance;

    const dbSession = await mongoose.startSession();
    let recomputed = [];
    try {
      await dbSession.withTransaction(async () => {
        period.isClosed = false;
        period.closedBy = undefined;
        period.closedAt = undefined;
        period.log.push({
          action: "Reopened",
          reason: trimmedReason,
          previousClosingBalance: previousClosing,
          performedBy: actor,
          performedAt: new Date(),
        });
        await period.save({ session: dbSession });

        recomputed = await recomputeChain({
          account: period.account,
          fromDate: period.periodStart,
          actor,
          reason: `Cascaded from reopening ${period.periodStart.toISOString().slice(0, 10)} – ${period.periodEnd.toISOString().slice(0, 10)}: ${trimmedReason}`,
          session: dbSession,
        });
      });
    } finally {
      await dbSession.endSession();
    }

    const changed = recomputed.filter((r) => r.changed);

    await cacheInvalidate("finance", "owner", "reports");
    return NextResponse.json({
      success: true,
      message: `Period reopened. ${recomputed.length} period(s) recomputed, ${changed.length} changed.`,
      reopened: {
        account: period.account,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        reason: trimmedReason,
        reopenedBy: actor,
      },
      recomputed,
    });
  } catch (error) {
    console.error("Error reopening period:", error);
    return NextResponse.json({ error: "Failed to reopen period" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(request.url);
    const account = searchParams.get("account") || "";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const query = {
      isClosed: true,
      branch: null,
      $expr: { $ne: ["$periodStart", "$periodEnd"] },
    };
    if (account) query.account = account;

    const periods = await AccountPeriod.find(query)
      .sort({ periodEnd: -1, account: 1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, periods, canReopen: session.user.role === "super-admin" });
  } catch (error) {
    console.error("Error listing closed periods:", error);
    return NextResponse.json({ error: "Failed to list closed periods" }, { status: 500 });
  }
}
