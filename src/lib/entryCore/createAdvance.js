// Extracted from advances/create/route.js's POST handler — used by "advance.out"/"advance.in".

import mongoose from "mongoose";
import Advance, { ADVANCE_PARTY_KINDS } from "@/models/Advance";
import Receivable from "@/models/Receivable";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { ADVANCE_TYPES, ADVANCE_REVENUE_CATEGORY } from "@/constants/advanceTypes";

const REFID_REQUIRED_KINDS = ["EMPLOYEE", "VENDOR", "PATIENT"];

export async function createAdvance({ payload, session: authSession }) {
  const { direction, account, amount, party, receivableId, subType, branch, date, dueDate, reference, remarks, receipts, allowOverRecovery } = payload;

  if (!["IN", "OUT"].includes(direction)) return { error: "direction must be IN or OUT", status: 400 };
  if (!accountsSync().includes(account)) return { error: `account must be one of: ${accountsSync().join(", ")}`, status: 400 };
  const parsedAmount = parseFloat(amount);
  if (!(parsedAmount > 0)) return { error: "Amount must be greater than zero", status: 400 };

  if (direction === "OUT") {
    if (!party?.kind || !ADVANCE_PARTY_KINDS.includes(party.kind)) {
      return { error: `party.kind must be one of: ${ADVANCE_PARTY_KINDS.join(", ")}`, status: 400 };
    }
    if (!party?.label?.trim()) return { error: "party.label is required", status: 400 };
    if (REFID_REQUIRED_KINDS.includes(party.kind) && !party.refId) {
      return { error: `party.refId is required when party.kind is "${party.kind}"`, status: 400 };
    }
  }
  if (branch && !ALL_BRANCHES.includes(branch)) return { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}`, status: 400 };

  const advanceDate = date ? new Date(date) : new Date();
  const performedBy = { name: authSession.user.name, email: authSession.user.email };
  const createdBy = { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() };
  const partyDoc = party ? { kind: party.kind, refId: party.refId || null, label: party.label.trim() } : undefined;
  const baseFields = {
    direction, account, amount: parsedAmount, date: advanceDate, party: partyDoc, branch: branch || null,
    reference: reference || "", remarks: remarks || "", receipts: Array.isArray(receipts) ? receipts : [], createdBy,
  };

  if (direction === "IN") {
    if (!receivableId || !mongoose.Types.ObjectId.isValid(receivableId)) {
      return { error: "A valid receivableId is required for a recovery", status: 400 };
    }
    const receivable = await Receivable.findById(receivableId);
    if (!receivable) return { error: "Advance (receivable) not found", status: 404 };
    if (receivable.isCancelled) return { error: "This advance has been cancelled", status: 400 };
    const hasAdvanceOut = await Advance.exists({ receivableId: receivable._id, direction: "OUT", isCancelled: { $ne: true } });
    if (!hasAdvanceOut) return { error: "This receivable was not created as an advance — cannot record a recovery against it here", status: 400 };

    const [recoveredAgg] = await Advance.aggregate([
      { $match: { receivableId: receivable._id, direction: "IN", isCancelled: { $ne: true } } },
      { $group: { _id: null, recovered: { $sum: "$amount" } } },
    ]);
    const [settledAgg] = await Advance.aggregate([
      { $match: { receivableId: receivable._id, direction: "OUT", isCancelled: { $ne: true }, settlesPayableId: { $ne: null } } },
      { $group: { _id: null, settled: { $sum: { $ifNull: ["$settlesPayableAmount", "$amount"] } } } },
    ]);
    const alreadyRecovered = (recoveredAgg?.recovered || 0) + (settledAgg?.settled || 0);
    const pending = Math.max(0, Math.round((receivable.totalAmount - alreadyRecovered) * 100) / 100);
    if (parsedAmount > pending && !allowOverRecovery) {
      return { error: `Recovering ₹${parsedAmount.toLocaleString("en-IN")} would exceed the outstanding balance of ₹${pending.toLocaleString("en-IN")}. Pass allowOverRecovery to record it anyway.`, pending, status: 400 };
    }

    const advance = new Advance({ ...baseFields, receivableId: receivable._id });
    advance.log.push({ action: "Created", newValue: String(parsedAmount), note: `Recovery — ${account}`, performedBy, performedAt: new Date() });
    await advance.save();
    return { data: advance, receivable, status: 201 };
  }

  if (receivableId) {
    if (!mongoose.Types.ObjectId.isValid(receivableId)) return { error: "Invalid receivableId", status: 400 };
    const dbSession = await mongoose.startSession();
    let advance;
    let receivable;
    try {
      await dbSession.withTransaction(async () => {
        receivable = await Receivable.findById(receivableId).session(dbSession);
        if (!receivable) throw new Error("__NOT_FOUND__");
        if (receivable.isCancelled) throw new Error("__CANCELLED__");
        const hasAdvanceOut = await Advance.exists({ receivableId: receivable._id, direction: "OUT", isCancelled: { $ne: true } }).session(dbSession);
        if (!hasAdvanceOut) throw new Error("__NOT_AN_ADVANCE__");

        const previousTotal = receivable.totalAmount;
        receivable.totalAmount = Math.round((previousTotal + parsedAmount) * 100) / 100;
        receivable.log.push({ action: "Amount Revised", previousValue: String(previousTotal), newValue: String(receivable.totalAmount), note: `Further advance paid out — ${account}`, performedBy, performedAt: new Date() });
        await receivable.save({ session: dbSession });

        const doc = new Advance({ ...baseFields, receivableId: receivable._id });
        doc.log.push({ action: "Created", newValue: String(parsedAmount), note: `Further advance — ${account}`, performedBy, performedAt: new Date() });
        await doc.save({ session: dbSession });
        advance = doc;
      });
    } catch (err) {
      if (err.message === "__NOT_FOUND__") return { error: "Advance (receivable) not found", status: 404 };
      if (err.message === "__CANCELLED__") return { error: "This advance has been cancelled", status: 400 };
      if (err.message === "__NOT_AN_ADVANCE__") return { error: "This receivable was not created as an advance — cannot add to it here", status: 400 };
      throw err;
    } finally {
      await dbSession.endSession();
    }
    return { data: advance, receivable, status: 201 };
  }

  if (!subType || !ADVANCE_TYPES.includes(subType)) {
    return { error: `subType must be one of: ${ADVANCE_TYPES.join(", ")}`, status: 400 };
  }

  const dbSession = await mongoose.startSession();
  let advance;
  let receivable;
  try {
    await dbSession.withTransaction(async () => {
      const newReceivable = new Receivable({
        payer: partyDoc, purpose: "ADVANCE_RECOVERY", revenueCategory: ADVANCE_REVENUE_CATEGORY, revenueSubType: subType,
        totalAmount: parsedAmount, dueDate: dueDate ? new Date(dueDate) : undefined, branch: branch || authSession.user.branch,
        costAlreadyRecognised: false, excludeFromPnl: true, remarks: remarks || "", createdBy,
      });
      newReceivable.log.push({ action: "Created", newValue: String(parsedAmount), note: `Advance paid out — ${subType} to ${partyDoc.label}`, performedBy, performedAt: new Date() });
      await newReceivable.save({ session: dbSession });

      const doc = new Advance({ ...baseFields, receivableId: newReceivable._id });
      doc.log.push({ action: "Created", newValue: String(parsedAmount), note: `New advance — ${account}`, performedBy, performedAt: new Date() });
      await doc.save({ session: dbSession });

      receivable = newReceivable;
      advance = doc;
    });
  } finally {
    await dbSession.endSession();
  }

  return { data: advance, receivable, status: 201 };
}
