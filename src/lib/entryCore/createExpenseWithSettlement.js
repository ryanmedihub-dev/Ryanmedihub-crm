

import mongoose from "mongoose";
import Advance from "@/models/Advance";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { checkPeriodLock } from "@/lib/periodLock";
import { createExpense } from "@/lib/entryCore/createExpense";
import { settleAdvanceAgainstPayable } from "@/lib/entryCore/settleAdvanceAgainstPayable";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function createExpenseWithSettlement({ payload, session: authSession }) {
  const allocations = (Array.isArray(payload.advanceSettlements) ? payload.advanceSettlements : [])
    .filter((a) => a?.advanceId && Number(a.amount) > 0)
    .map((a) => ({ advanceId: String(a.advanceId), amount: round2(a.amount) }));

  
  
  if (allocations.length === 0) {
    const r = await createExpense({ payload, session: authSession });
    if (r.error) return r;
    return { data: { transaction: r.data, settlements: [], payable: null }, status: r.status || 201 };
  }

  const { payableId, allowOverpayment, furtherMode, date } = payload;
  const netAmount = round2(payload.amount || 0);

  if (!payableId || !mongoose.Types.ObjectId.isValid(payableId)) {
    return { error: "Select which payable these advances settle against", status: 400 };
  }
  if (netAmount < 0) return { error: "Net payable cannot be negative", status: 400 };

  
  const payable = await Payable.findById(payableId);
  if (!payable) return { error: "Payable not found", status: 404 };
  if (payable.isCancelled) return { error: "This payable has been cancelled", status: 400 };

  const advances = await Advance.find({
    _id: { $in: allocations.map((a) => new mongoose.Types.ObjectId(a.advanceId)) },
  });
  const byId = new Map(advances.map((a) => [String(a._id), a]));

  const payRef = payable.payee?.refId ? String(payable.payee.refId) : null;
  for (const alloc of allocations) {
    const adv = byId.get(alloc.advanceId);
    if (!adv) return { error: `Advance ${alloc.advanceId} not found`, status: 404 };
    if (adv.isCancelled) return { error: `Advance for ${adv.party?.label || "party"} has been cancelled`, status: 400 };
    if (adv.direction !== "OUT") return { error: "Only a paid-out advance can settle a payable", status: 400 };

    const advRef = adv.party?.refId ? String(adv.party.refId) : null;
    if (!advRef || !payRef || advRef !== payRef) {
      return {
        error: `Advance for ${adv.party?.label || "that party"} cannot settle a payable for ${payable.payee?.label || "another party"}`,
        status: 400,
      };
    }
  }

  const allocTotal = round2(allocations.reduce((s, a) => s + a.amount, 0));

  const txCollection = Transactions.collection.name;
  const [beforeAgg] = await Payable.aggregate([
    { $match: { _id: payable._id } },
    ...buildPayableAggregationStages(txCollection),
  ]);
  const pending = round2(beforeAgg?.pending ?? payable.totalAmount);
  if (!allowOverpayment && round2(allocTotal + netAmount) > round2(pending + 0.005)) {
    return {
      error:
        `Advance applied (₹${allocTotal.toLocaleString("en-IN")}) plus payment (₹${netAmount.toLocaleString("en-IN")}) ` +
        `is more than this payable's outstanding (₹${pending.toLocaleString("en-IN")})`,
      status: 400,
    };
  }

  const lockReason = await checkPeriodLock({ furtherMode: furtherMode || null, date: date || new Date() });
  if (lockReason) return { error: lockReason, status: 423, periodLocked: true };

  
  const dbSession = await mongoose.startSession();
  let outcome;
  try {
    await dbSession.withTransaction(async () => {
      const fresh = await Payable.findById(payable._id).session(dbSession);
      if (!fresh || fresh.isCancelled) {
        const e = new Error("This payable has been cancelled");
        e.settleResult = { error: "This payable has been cancelled", status: 400 };
        throw e;
      }

      const settled = [];
      for (const alloc of allocations) {
        const r = await settleAdvanceAgainstPayable({
          advanceId: alloc.advanceId,
          payableId: String(payable._id),
          amount: alloc.amount,
          note: "Applied on expense entry",
          session: authSession,
          dbSession,
        });
        settled.push(r.data); 
      }

      let transaction = null;
      if (netAmount > 0) {
        const res = await createExpense({
          payload: { ...payload, amount: netAmount, advanceSettlementIds: settled.map((s) => s.settlementId) },
          session: authSession,
          dbSession,
        });
        if (res.error) {
          const e = new Error(res.error);
          e.settleResult = res;
          throw e;
        }
        transaction = res.data;
      } else {
        
        
        fresh.log.push({
          action: "Note Added",
          note:
            `Closed by advance settlement (₹${allocTotal.toLocaleString("en-IN")}) — no cash movement. ` +
            `Lines: ${settled.map((s) => s.settlementId).join(", ")}`,
          performedBy: { name: authSession.user.name, email: authSession.user.email },
          performedAt: new Date(),
        });
        await fresh.save({ session: dbSession });
      }

      outcome = { transaction, settled };
    });
  } catch (err) {
    const r = err?.settleResult;
    if (r?.error) {
      return { error: r.error, status: r.status || 400, ...(r.periodLocked ? { periodLocked: true } : {}) };
    }
    console.error("create-with-settlement transaction failed:", err);
    return { error: "Could not book the settlement — nothing was saved.", status: 500 };
  } finally {
    await dbSession.endSession();
  }

  const [afterAgg] = await Payable.aggregate([
    { $match: { _id: payable._id } },
    ...buildPayableAggregationStages(txCollection),
  ]);

  return {
    data: {
      transaction: outcome.transaction,
      settlements: outcome.settled,
      payable: { pending: round2(afterAgg?.pending ?? 0) },
    },
    status: 201,
  };
}
