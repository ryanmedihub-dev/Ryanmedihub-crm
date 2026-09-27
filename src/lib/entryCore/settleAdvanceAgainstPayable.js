

import mongoose from "mongoose";
import Advance from "@/models/Advance";
import Receivable from "@/models/Receivable";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { foldLegacyIntoArray, totalSettledAmount } from "@/lib/advanceSettlements";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function abortableError(result, joiningCallerTx) {
  if (joiningCallerTx) {
    const e = new Error(result.error);
    e.settleResult = result;
    throw e;
  }
  return result;
}

export async function settleAdvanceAgainstPayable({
  advanceId,
  payableId,
  amount,
  note,
  session: authSession,
  dbSession = null,
}) {
  const joining = !!dbSession;

  if (!mongoose.Types.ObjectId.isValid(advanceId)) {
    return abortableError({ error: "Invalid advance id", status: 400 }, joining);
  }
  if (!payableId || !mongoose.Types.ObjectId.isValid(payableId)) {
    return abortableError({ error: "A valid settlesPayableId is required", status: 400 }, joining);
  }

  const own = !dbSession;
  const s = dbSession || (await mongoose.startSession());
  let result;

  const run = async () => {
    const advance = await Advance.findById(advanceId).session(s);
    if (!advance) return void (result = { error: "Advance not found", status: 404 });
    if (advance.isCancelled) return void (result = { error: "Reinstate this advance before settling it", status: 400 });
    if (advance.direction !== "OUT") {
      return void (result = { error: "Only the advance's own paid-out (OUT) row can settle a payable", status: 400 });
    }

    const target = await Payable.findById(payableId).session(s);
    if (!target) return void (result = { error: "Payable not found", status: 404 });
    if (target.isCancelled) return void (result = { error: "This payable has been cancelled", status: 400 });

    
    const alreadySettled = totalSettledAmount(advance);
    const remainingOnAdvance = round2(round2(advance.amount) - alreadySettled);

    const settleAmount =
      amount === undefined || amount === null || amount === ""
        ? remainingOnAdvance
        : round2(amount);

    if (!(settleAmount > 0)) {
      return void (result = { error: "Settlement amount must be greater than zero", status: 400 });
    }
    if (settleAmount > remainingOnAdvance) {
      return void (result = {
        error: `Cannot settle more than what's left on this advance (₹${remainingOnAdvance.toLocaleString("en-IN")})`,
        status: 400,
      });
    }

    
    const txCollection = Transactions.collection.name;
    const [payableAgg] = await Payable.aggregate([
      { $match: { _id: target._id } },
      ...buildPayableAggregationStages(txCollection),
    ]).session(s);
    const payablePending = round2(payableAgg?.pending ?? target.totalAmount);
    if (settleAmount > payablePending) {
      return void (result = {
        error: `Cannot settle more than the payable's outstanding (₹${payablePending.toLocaleString("en-IN")})`,
        status: 400,
      });
    }

    
    const [receivableAgg] = await Receivable.aggregate([
      { $match: { _id: advance.receivableId } },
      ...buildReceivableAggregationStages(txCollection),
    ]).session(s);
    const receivablePending = round2(receivableAgg?.netPending ?? receivableAgg?.pending ?? advance.amount);
    if (settleAmount > receivablePending) {
      return void (result = {
        error: `Only ₹${receivablePending.toLocaleString("en-IN")} is left to recover on this advance — settle that or less`,
        status: 400,
      });
    }

    const performedBy = { name: authSession.user.name, email: authSession.user.email };

    foldLegacyIntoArray(advance, { performedBy });
    advance.settlements.push({
      payableId: target._id,
      amount: settleAmount,
      note: note || undefined,
      settledAt: new Date(),
      settledBy: performedBy,
    });
    const line = advance.settlements[advance.settlements.length - 1];
    advance.log.push({
      action: "Note Added",
      note:
        note ||
        `Settling ₹${settleAmount.toLocaleString("en-IN")} against payable ${target._id} (${target.payee?.label || "party"})`,
      performedBy,
      performedAt: new Date(),
    });
    await advance.save({ session: s });

    target.log.push({
      action: "Note Added",
      note:
        note ||
        `Settled ₹${settleAmount.toLocaleString("en-IN")} by advance ${advance._id} (${advance.party.label})`,
      performedBy,
      performedAt: new Date(),
    });
    await target.save({ session: s });

    result = {
      data: {
        advanceId: String(advance._id),
        payableId: String(target._id),
        settlementId: String(line._id),
        amount: settleAmount,
      },
      status: 200,
    };
  };

  try {
    if (own) await s.withTransaction(run);
    else await run();
  } finally {
    if (own) await s.endSession();
  }

  if (result?.error) return abortableError(result, joining);
  return result;
}

export async function unsettleAdvanceFromPayable({
  advanceId,
  settlementId,
  note,
  session: authSession,
  dbSession = null,
}) {
  const joining = !!dbSession;
  if (!mongoose.Types.ObjectId.isValid(advanceId)) {
    return abortableError({ error: "Invalid advance id", status: 400 }, joining);
  }

  const own = !dbSession;
  const s = dbSession || (await mongoose.startSession());
  let result;

  const run = async () => {
    const advance = await Advance.findById(advanceId).session(s);
    if (!advance) return void (result = { error: "Advance not found", status: 404 });
    if (advance.isCancelled) return void (result = { error: "Reinstate this advance before settling it", status: 400 });
    if (advance.direction !== "OUT") {
      return void (result = { error: "Only the advance's own paid-out (OUT) row can settle a payable", status: 400 });
    }

    const hasLegacy = advance.settlesPayableId != null;
    const arr = advance.settlements || [];

    let targetPayableId;
    let removedAmount;
    let removeLegacy = false;
    let removeIdx = -1;

    if (settlementId) {
      removeIdx = arr.findIndex((x) => String(x._id) === String(settlementId));
      if (removeIdx === -1) return void (result = { error: "Settlement not found on this advance", status: 400 });
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
      return void (result = { error: "This advance isn't settling a payable", status: 400 });
    } else {
      return void (result = {
        error: "This advance is settling multiple payables — specify which one to unlink (settlementId)",
        status: 400,
      });
    }

    const performedBy = { name: authSession.user.name, email: authSession.user.email };
    const targetDoc = await Payable.findById(targetPayableId).session(s);

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
    await advance.save({ session: s });

    if (targetDoc) {
      targetDoc.log.push({
        action: "Note Added",
        note: note || `No longer settled by advance ${advance._id}`,
        performedBy,
        performedAt: new Date(),
      });
      await targetDoc.save({ session: s });
    }

    result = { data: { advanceId: String(advance._id), payableId: String(targetPayableId), amount: Number(removedAmount) }, status: 200 };
  };

  try {
    if (own) await s.withTransaction(run);
    else await run();
  } finally {
    if (own) await s.endSession();
  }

  if (result?.error) return abortableError(result, joining);
  return result;
}
