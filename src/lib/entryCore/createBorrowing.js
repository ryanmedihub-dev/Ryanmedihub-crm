

import mongoose from "mongoose";
import Borrowing, { BORROWING_PARTY_KINDS } from "@/models/Borrowing";
import Payable from "@/models/Payable";
import { ALL_BRANCHES } from "@/lib/branches";
import { accountsSync, expenseTypesSync } from "@/lib/masterData";

const borrowingSubtypes = () => expenseTypesSync("Borrowings");
const REFID_REQUIRED_KINDS = ["VENDOR", "EMPLOYEE", "PATIENT"];

export async function createBorrowing({ payload, session: authSession }) {
  const { direction, account, amount, party, payableId, subType, branch, date, reference, remarks, receipts, allowOverpayment } = payload;

  if (!["IN", "OUT"].includes(direction)) return { error: "direction must be IN or OUT", status: 400 };
  if (!accountsSync().includes(account)) return { error: `account must be one of: ${accountsSync().join(", ")}`, status: 400 };
  const parsedAmount = parseFloat(amount);
  if (!(parsedAmount > 0)) return { error: "Amount must be greater than zero", status: 400 };

  if (direction === "IN") {
    if (!party?.kind || !BORROWING_PARTY_KINDS.includes(party.kind)) {
      return { error: `party.kind must be one of: ${BORROWING_PARTY_KINDS.join(", ")}`, status: 400 };
    }
    if (!party?.label?.trim()) return { error: "party.label is required", status: 400 };
    if (REFID_REQUIRED_KINDS.includes(party.kind) && !party.refId) {
      return { error: `party.refId is required when party.kind is "${party.kind}"`, status: 400 };
    }
  }
  if (branch && !ALL_BRANCHES.includes(branch)) return { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}`, status: 400 };

  const performedBy = { name: authSession.user.name, email: authSession.user.email };
  const createdBy = { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() };
  const borrowingDate = date ? new Date(date) : new Date();
  const partyDoc = party ? { kind: party.kind, refId: party.refId || null, label: party.label.trim() } : undefined;
  const baseFields = {
    direction, account, amount: parsedAmount, date: borrowingDate, party: partyDoc, branch: branch || null,
    reference: reference || "", remarks: remarks || "", receipts: Array.isArray(receipts) ? receipts : [], createdBy,
  };

  if (direction === "OUT") {
    if (!payableId || !mongoose.Types.ObjectId.isValid(payableId)) return { error: "A valid payableId is required for a repayment", status: 400 };
    const payable = await Payable.findById(payableId);
    if (!payable) return { error: "Loan (payable) not found", status: 404 };
    if (payable.isCancelled) return { error: "This loan has been cancelled", status: 400 };
    const hasBorrowingIn = await Borrowing.exists({ payableId: payable._id, direction: "IN", isCancelled: { $ne: true } });
    if (!hasBorrowingIn) return { error: "This payable was not created as a borrowing — cannot record a repayment against it here", status: 400 };

    const [paidAgg] = await Borrowing.aggregate([
      { $match: { payableId: payable._id, direction: "OUT", isCancelled: { $ne: true } } },
      { $group: { _id: null, paid: { $sum: "$amount" } } },
    ]);
    const alreadyPaid = paidAgg?.paid || 0;
    const pending = Math.max(0, Math.round((payable.totalAmount - alreadyPaid) * 100) / 100);
    if (parsedAmount > pending && !allowOverpayment) {
      return { error: `Repaying ₹${parsedAmount.toLocaleString("en-IN")} would exceed the outstanding balance of ₹${pending.toLocaleString("en-IN")}. Pass allowOverpayment to record it anyway.`, pending, status: 400 };
    }

    const borrowing = new Borrowing({ ...baseFields, payableId: payable._id });
    borrowing.log.push({ action: "Created", newValue: String(parsedAmount), note: `Repayment — ${account}`, performedBy, performedAt: new Date() });
    await borrowing.save();
    return { data: borrowing, payable, status: 201 };
  }

  if (payableId) {
    if (!mongoose.Types.ObjectId.isValid(payableId)) return { error: "Invalid payableId", status: 400 };
    const dbSession = await mongoose.startSession();
    let borrowing;
    let payable;
    try {
      await dbSession.withTransaction(async () => {
        payable = await Payable.findById(payableId).session(dbSession);
        if (!payable) throw new Error("__NOT_FOUND__");
        if (payable.isCancelled) throw new Error("__CANCELLED__");
        const hasBorrowingIn = await Borrowing.exists({ payableId: payable._id, direction: "IN", isCancelled: { $ne: true } }).session(dbSession);
        if (!hasBorrowingIn) throw new Error("__NOT_A_BORROWING__");

        const previousTotal = payable.totalAmount;
        payable.totalAmount = Math.round((previousTotal + parsedAmount) * 100) / 100;
        payable.log.push({ action: "Amount Revised", previousValue: String(previousTotal), newValue: String(payable.totalAmount), note: `Additional tranche received — ${account}`, performedBy, performedAt: new Date() });
        await payable.save({ session: dbSession });

        const doc = new Borrowing({ ...baseFields, payableId: payable._id });
        doc.log.push({ action: "Created", newValue: String(parsedAmount), note: `Additional tranche — ${account}`, performedBy, performedAt: new Date() });
        await doc.save({ session: dbSession });
        borrowing = doc;
      });
    } catch (err) {
      if (err.message === "__NOT_FOUND__") return { error: "Loan (payable) not found", status: 404 };
      if (err.message === "__CANCELLED__") return { error: "This loan has been cancelled", status: 400 };
      if (err.message === "__NOT_A_BORROWING__") return { error: "This payable was not created as a borrowing — cannot add a tranche to it here", status: 400 };
      throw err;
    } finally {
      await dbSession.endSession();
    }
    return { data: borrowing, payable, status: 201 };
  }

  if (!subType || !borrowingSubtypes().includes(subType)) {
    return { error: `subType must be one of: ${borrowingSubtypes().join(", ")}`, status: 400 };
  }

  const dbSession = await mongoose.startSession();
  let borrowing;
  let payable;
  try {
    await dbSession.withTransaction(async () => {
      const newPayable = new Payable({
        payee: partyDoc, purpose: "OTHER", expenseCategory: "Borrowings", expenseSubType: subType, totalAmount: parsedAmount,
        branch: branch || authSession.user.branch, costAlreadyRecognised: false, excludeFromPnl: true, remarks: remarks || "", createdBy,
      });
      newPayable.log.push({ action: "Created", newValue: String(parsedAmount), note: `Borrowing received — ${subType} from ${partyDoc.label}`, performedBy, performedAt: new Date() });
      await newPayable.save({ session: dbSession });

      const doc = new Borrowing({ ...baseFields, payableId: newPayable._id });
      doc.log.push({ action: "Created", newValue: String(parsedAmount), note: `New loan — ${account}`, performedBy, performedAt: new Date() });
      await doc.save({ session: dbSession });

      payable = newPayable;
      borrowing = doc;
    });
  } finally {
    await dbSession.endSession();
  }

  return { data: borrowing, payable, status: 201 };
}
