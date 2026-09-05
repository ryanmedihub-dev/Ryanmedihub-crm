import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Advance from "@/models/Advance";
import Receivable from "@/models/Receivable";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { checkPeriodLock } from "@/lib/periodLock";
import { foldLegacyIntoArray, totalSettledAmount, settledTotalExpr } from "@/lib/advanceSettlements";

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
      if (advance.isCancelled) {
        return NextResponse.json({ error: "Reinstate this advance before settling it" }, { status: 400 });
      }
      if (advance.direction !== "OUT") {
        return NextResponse.json(
          { error: "Only the advance's own paid-out (OUT) row can settle a payable" },
          { status: 400 },
        );
      }

      if (action === "unsettle") {
        // Which line to remove. `settlementId` addresses one entry in the settlements array;
        // omitted, it only works when there's exactly one settlement total (back-compat with
        // the old single-payable UI, and the common case of a fresh multi-settle advance).
        const { settlementId } = body;
        const hasLegacy = advance.settlesPayableId != null;
        const arr = advance.settlements || [];

        let targetPayableId;
        let removedAmount;
        let removeLegacy = false;
        let removeIdx = -1;

        if (settlementId) {
          removeIdx = arr.findIndex((s) => String(s._id) === String(settlementId));
          if (removeIdx === -1) {
            return NextResponse.json({ error: "Settlement not found on this advance" }, { status: 400 });
          }
          targetPayableId = arr[removeIdx].payableId;
          removedAmount = arr[removeIdx].amount;
        } else if (hasLegacy && arr.length === 0) {
          targetPayableId = advance.settlesPayableId;
          removedAmount = advance.settlesPayableAmount ?? advance.amount;
          removeLegacy = true;
        } else if (!hasLegacy && arr.length === 1) {
          targetPayableId = arr[0].payableId;
          removedAmount = arr[0].amount;
          removeIdx = 0;
        } else if (!hasLegacy && arr.length === 0) {
          return NextResponse.json({ error: "This advance isn't settling a payable" }, { status: 400 });
        } else {
          return NextResponse.json(
            { error: "This advance is settling multiple payables — specify which one to unlink (settlementId)" },
            { status: 400 },
          );
        }

        const dbSession = await mongoose.startSession();
        try {
          await dbSession.withTransaction(async () => {
            const targetDoc = await Payable.findById(targetPayableId).session(dbSession);
            advance.log.push({
              action: "Note Added",
              note: note || `Unlinked ₹${Number(removedAmount).toLocaleString("en-IN")} from payable ${targetPayableId}`,
              performedBy,
              performedAt: new Date(),
            });
            if (removeLegacy) {
              advance.settlesPayableId = null;
              advance.settlesPayableAmount = null;
            } else {
              advance.settlements.splice(removeIdx, 1);
            }
            await advance.save({ session: dbSession });
            if (targetDoc) {
              targetDoc.log.push({
                action: "Note Added",
                note: note || `No longer settled by advance ${advance._id}`,
                performedBy,
                performedAt: new Date(),
              });
              await targetDoc.save({ session: dbSession });
            }
          });
        } finally {
          await dbSession.endSession();
        }
        return NextResponse.json({ message: "Settlement unlinked", advance });
      }

      const { settlesPayableId } = body;
      if (!settlesPayableId || !mongoose.Types.ObjectId.isValid(settlesPayableId)) {
        return NextResponse.json({ error: "A valid settlesPayableId is required" }, { status: 400 });
      }
      const target = await Payable.findById(settlesPayableId);
      if (!target) {
        return NextResponse.json({ error: "Payable not found" }, { status: 404 });
      }
      if (target.isCancelled) {
        return NextResponse.json({ error: "This payable has been cancelled" }, { status: 400 });
      }

      // How much of the advance is left to apply to a NEW line, after every existing
      // settlement (legacy pair + settlements array) already on this advance.
      const alreadySettled = totalSettledAmount(advance);
      const remainingOnAdvance = round2(round2(advance.amount) - alreadySettled);

      // How much of the advance to apply. Defaults to whatever's left when the caller
      // doesn't specify one.
      const rawAmount = body.amount ?? body.settlesPayableAmount;
      const settleAmount = rawAmount === undefined || rawAmount === null || rawAmount === ""
        ? remainingOnAdvance
        : round2(rawAmount);

      if (!(settleAmount > 0)) {
        return NextResponse.json({ error: "Settlement amount must be greater than zero" }, { status: 400 });
      }
      if (settleAmount > remainingOnAdvance) {
        return NextResponse.json(
          {
            error: `Cannot settle more than what's left on this advance (₹${remainingOnAdvance.toLocaleString("en-IN")})`,
          },
          { status: 400 },
        );
      }

      // Can't apply more than what the payable still owes. buildPayableAggregationStages
      // already sums every settlement line (from this advance or any other) against this
      // payable, so this naturally reflects prior lines too.
      const txCollection = Transactions.collection.name;
      const [payableAgg] = await Payable.aggregate([
        { $match: { _id: target._id } },
        ...buildPayableAggregationStages(txCollection),
      ]);
      const payablePending = round2(payableAgg?.pending ?? target.totalAmount);
      if (settleAmount > payablePending) {
        return NextResponse.json(
          {
            error: `Cannot settle more than the payable's outstanding (₹${payablePending.toLocaleString("en-IN")})`,
          },
          { status: 400 },
        );
      }

      // Can't recover more than the advance's receivable still has outstanding. Reflects
      // prior (cash) recoveries plus any settlement lines already saved on this advance.
      const [receivableAgg] = await Receivable.aggregate([
        { $match: { _id: advance.receivableId } },
        ...buildReceivableAggregationStages(txCollection),
      ]);
      const receivablePending = round2(
        receivableAgg?.netPending ?? receivableAgg?.pending ?? advance.amount,
      );
      if (settleAmount > receivablePending) {
        return NextResponse.json(
          {
            error: `Only ₹${receivablePending.toLocaleString("en-IN")} is left to recover on this advance — settle that or less`,
          },
          { status: 400 },
        );
      }

      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          foldLegacyIntoArray(advance, { performedBy });
          advance.settlements.push({
            payableId: target._id,
            amount: settleAmount,
            note: note || undefined,
            settledAt: new Date(),
            settledBy: performedBy,
          });
          advance.log.push({
            action: "Note Added",
            note:
              note ||
              `Settling ₹${settleAmount.toLocaleString("en-IN")} against payable ${target._id} (${target.payee?.label || "party"})`,
            performedBy,
            performedAt: new Date(),
          });
          await advance.save({ session: dbSession });

          target.log.push({
            action: "Note Added",
            note:
              note ||
              `Settled ₹${settleAmount.toLocaleString("en-IN")} by advance ${advance._id} (${advance.party.label})`,
            performedBy,
            performedAt: new Date(),
          });
          await target.save({ session: dbSession });
        });
      } finally {
        await dbSession.endSession();
      }
      return NextResponse.json({ message: "Settlement linked", advance });
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

    return NextResponse.json({ message: "Advance deleted" });
  } catch (error) {
    console.error("Error deleting advance:", error);
    return NextResponse.json({ error: "Failed to delete advance" }, { status: 500 });
  }
}
