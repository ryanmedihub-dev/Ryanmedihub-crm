import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Advance from "@/models/Advance";
import Receivable from "@/models/Receivable";
import Payable from "@/models/Payable";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { checkPeriodLock } from "@/lib/periodLock";
import { totalSettledAmount, settledTotalExpr } from "@/lib/advanceSettlements";
import { settleAdvanceAgainstPayable, unsettleAdvanceFromPayable } from "@/lib/entryCore/settleAdvanceAgainstPayable";
import { cacheInvalidate } from "@/lib/cache";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const ALLOWED_ROLES = ["admin", "super-admin"];

async function loadOr404(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return { error: "Invalid advance id", status: 400 };
  const advance = await Advance.findById(id);
  if (!advance) return { error: "Advance not found", status: 404 };
  return { advance };
}

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }
    await connectDB();
    const { id } = await params;
    const found = await loadOr404(id);
    if (found.error) return NextResponse.json({ error: found.error }, { status: found.status });
    return NextResponse.json({ advance: found.advance });
  } catch (error) {
    console.error("Error fetching advance:", error);
    return NextResponse.json({ error: "Failed to fetch advance" }, { status: 500 });
  }
}

async function resyncReceivableTotal({ receivableId, session, performedBy, note }) {
  const receivable = await Receivable.findById(receivableId).session(session);
  if (!receivable) return null;

  const [agg] = await Advance.aggregate([
    { $match: { receivableId, direction: "OUT", isCancelled: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).session(session);
  const newTotal = Math.round((agg?.total || 0) * 100) / 100;

  if (newTotal === receivable.totalAmount) return receivable;

  receivable.log.push({
    action: "Amount Revised",
    previousValue: String(receivable.totalAmount),
    newValue: String(newTotal),
    note,
    performedBy,
    performedAt: new Date(),
  });
  receivable.totalAmount = newTotal;
  if (newTotal <= 0 && !receivable.isCancelled) {
    receivable.isCancelled = true;
    receivable.log.push({
      action: "Cancelled",
      previousValue: "false",
      newValue: "true",
      note: "No advance rows remain against this receivable",
      performedBy,
      performedAt: new Date(),
    });
  } else if (newTotal > 0 && receivable.isCancelled) {
    receivable.isCancelled = false;
    receivable.log.push({
      action: "Cancelled",
      previousValue: "true",
      newValue: "false",
      note: "Advance row(s) restored — reopened",
      performedBy,
      performedAt: new Date(),
    });
  }
  await receivable.save({ session });
  return receivable;
}

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    const found = await loadOr404(id);
    if (found.error) return NextResponse.json({ error: found.error }, { status: found.status });
    const advance = found.advance;

    const body = await req.json();
    const { action, note } = body;
    if (!["cancel", "reinstate", "settle", "unsettle"].includes(action)) {
      return NextResponse.json({ error: "action must be: cancel, reinstate, settle, or unsettle" }, { status: 400 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };

    if (action === "settle" || action === "unsettle") {
      
      
      if (action === "unsettle") {
        const r = await unsettleAdvanceFromPayable({
          advanceId: id,
          settlementId: body.settlementId,
          note,
          session,
        });
        if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
        const fresh = await Advance.findById(id);
        await cacheInvalidate("finance", "owner");
        return NextResponse.json({ message: "Settlement unlinked", advance: fresh });
      }

      const r = await settleAdvanceAgainstPayable({
        advanceId: id,
        payableId: body.settlesPayableId,
        amount: body.amount ?? body.settlesPayableAmount,
        note,
        session,
      });
      if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
      const fresh = await Advance.findById(id);
      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Settlement linked", advance: fresh });
    }

    if (action === "cancel" && advance.isCancelled) {
      return NextResponse.json({ error: "This advance is already cancelled" }, { status: 400 });
    }
    if (action === "reinstate" && !advance.isCancelled) {
      return NextResponse.json({ error: "This advance is not cancelled" }, { status: 400 });
    }

    const nextCancelled = action === "cancel";

    if (advance.direction === "OUT" && action === "cancel") {
      const inCount = await Advance.countDocuments({
        receivableId: advance.receivableId,
        direction: "IN",
        isCancelled: { $ne: true },
      });
      if (inCount > 0) {
        return NextResponse.json(
          {
            error:
              "Recoveries already exist against this advance — cancel or reverse those first, or this would strand them.",
          },
          { status: 400 },
        );
      }
    }

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        advance.isCancelled = nextCancelled;
        advance.log.push({
          action: "Cancelled",
          previousValue: String(!nextCancelled),
          newValue: String(nextCancelled),
          note: note || (nextCancelled ? "Cancelled" : "Reinstated"),
          performedBy,
          performedAt: new Date(),
        });
        await advance.save({ session: dbSession });

        if (advance.direction === "OUT") {
          await resyncReceivableTotal({
            receivableId: advance.receivableId,
            session: dbSession,
            performedBy,
            note: note || `Advance row ${advance._id} ${action}led`,
          });
        }
      });
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({
      message: nextCancelled ? "Advance cancelled" : "Advance reinstated",
      advance,
    });
  } catch (error) {
    console.error("Error updating advance:", error);
    return NextResponse.json({ error: "Failed to update advance" }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    const found = await loadOr404(id);
    if (found.error) return NextResponse.json({ error: found.error }, { status: found.status });
    const advance = found.advance;

    if (advance.isCancelled) {
      return NextResponse.json({ error: "Reinstate this advance before editing it" }, { status: 400 });
    }

    const body = await req.json();
    const { amount, date, account, branch, reference, remarks, receipts, allowOverRecovery } = body;

    if (account !== undefined && !accountsSync().includes(account)) {
      return NextResponse.json({ error: `account must be one of: ${accountsSync().join(", ")}` }, { status: 400 });
    }
    if (branch && !ALL_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` }, { status: 400 });
    }
    const parsedAmount = amount !== undefined ? parseFloat(amount) : advance.amount;
    if (!(parsedAmount > 0)) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    const nextAccount = account ?? advance.account;
    const nextDate = date ? new Date(date) : advance.date;
    const lockReason = await checkPeriodLock(
      { furtherMode: advance.account, date: advance.date },
      { furtherMode: nextAccount, date: nextDate },
    );
    if (lockReason) {
      return NextResponse.json({ error: lockReason, periodLocked: true }, { status: 423 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };
    const amountChanged = parsedAmount !== advance.amount;

    const totalSettled = totalSettledAmount(advance);
    if (totalSettled > 0 && parsedAmount < round2(totalSettled)) {
      return NextResponse.json(
        {
          error:
            `This advance is settling ₹${totalSettled.toLocaleString("en-IN")} against ${
              (advance.settlements?.length || 0) + (advance.settlesPayableId ? 1 : 0) > 1 ? "payables" : "a payable"
            }. ` + "Unlink or lower those settlements before reducing the advance below it.",
        },
        { status: 400 },
      );
    }

    if (advance.direction === "IN" && amountChanged) {
      const [recoveredAgg] = await Advance.aggregate([
        { $match: { receivableId: advance.receivableId, direction: "IN", isCancelled: { $ne: true }, _id: { $ne: advance._id } } },
        { $group: { _id: null, recovered: { $sum: "$amount" } } },
      ]);
      const [settledAgg] = await Advance.aggregate([
        { $match: { receivableId: advance.receivableId, direction: "OUT", isCancelled: { $ne: true } } },
        { $group: { _id: null, settled: { $sum: settledTotalExpr } } },
      ]);
      const receivable = await Receivable.findById(advance.receivableId).lean();
      const pendingExcludingThis = Math.max(
        0,
        Math.round(
          ((receivable?.totalAmount || 0) -
            (recoveredAgg?.recovered || 0) -
            (settledAgg?.settled || 0)) *
            100,
        ) / 100,
      );
      if (parsedAmount > pendingExcludingThis && !allowOverRecovery) {
        return NextResponse.json(
          {
            error: `That amount would exceed the outstanding balance of ₹${pendingExcludingThis.toLocaleString("en-IN")}. Pass allowOverRecovery to save it anyway.`,
            pending: pendingExcludingThis,
          },
          { status: 400 },
        );
      }
    }

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const previousAmount = advance.amount;
        advance.amount = parsedAmount;
        if (account !== undefined) advance.account = account;
        if (date) advance.date = nextDate;
        if (branch !== undefined) advance.branch = branch || null;
        if (reference !== undefined) advance.reference = reference;
        if (remarks !== undefined) advance.remarks = remarks;
        if (Array.isArray(receipts)) advance.receipts = receipts;

        if (amountChanged) {
          advance.log.push({
            action: "Amount Revised",
            previousValue: String(previousAmount),
            newValue: String(parsedAmount),
            performedBy,
            performedAt: new Date(),
          });
        }

        await advance.save({ session: dbSession });

        if (amountChanged && advance.direction === "OUT") {
          await resyncReceivableTotal({
            receivableId: advance.receivableId,
            session: dbSession,
            performedBy,
            note: `Advance row ${advance._id} amount edited`,
          });
        }
      });
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Advance updated", advance });
  } catch (error) {
    console.error("Error editing advance:", error);
    return NextResponse.json({ error: "Failed to edit advance" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    const found = await loadOr404(id);
    if (found.error) return NextResponse.json({ error: found.error }, { status: found.status });
    const advance = found.advance;

    if (!advance.isCancelled) {
      return NextResponse.json(
        { error: "Cancel this advance before deleting it — deleting an active row would silently drop its effect on the receivable." },
        { status: 400 },
      );
    }

    await Advance.deleteOne({ _id: advance._id });

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Advance deleted" });
  } catch (error) {
    console.error("Error deleting advance:", error);
    return NextResponse.json({ error: "Failed to delete advance" }, { status: 500 });
  }
}
