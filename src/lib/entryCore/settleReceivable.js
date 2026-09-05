// Extracted from receivables/[id]/receipt/route.js's POST handler — used by
// "receivable.settle". AUDIT.md B1/N10: this route never recomputes patient.payments even
// when the receivable resolves to a patient, and never checked period lock (the new
// dispatcher's guards.js now does, for anything submitted through it — see the Phase B
// response's notes on what that does and doesn't change). Neither is fixed inside this
// function itself; it is a faithful port of the route body.

import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import { REVENUE_METHODS } from "@/constants/paymentMethods";
import { getBankRoutingDefaults } from "@/lib/masterData/lists";
import { unsettledMethodsSync, nonCashMethodsSync } from "@/lib/masterData";
import { deriveReceiptTransactionCategory } from "@/lib/entryEngine/derive";

const ALLOWED_METHODS = REVENUE_METHODS.map((m) => m.value);

export async function settleReceivable({ receivableId, payload, session: authSession }) {
  const { amount, date, method, paymentId, remarks, receipts, allowOverpayment, receiptMode: receiptModeInput, furtherMode: furtherModeInput, branch: branchInput, externalParty } = payload;

  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || parsedAmount <= 0) return { error: "A receipt amount greater than zero is required", status: 400 };
  if (furtherModeInput !== undefined && !furtherModeInput && !nonCashMethodsSync().includes(method)) {
    return { error: "furtherMode is required — name the account this money landed in", status: 400 };
  }
  if (!method || !ALLOWED_METHODS.includes(method)) {
    return { error: `method must be one of: ${ALLOWED_METHODS.join(", ")}`, status: 400 };
  }

  const receivable = await Receivable.findById(receivableId);
  if (!receivable) return { error: "Receivable not found", status: 404 };
  if (receivable.isCancelled) return { error: "This receivable has been cancelled", status: 400 };

  const [receivedAgg] = await Transactions.aggregate([
    { $match: { receivableId: receivable._id, costType: "Revenue", approvalStatus: "APPROVED", method: { $nin: unsettledMethodsSync() } } },
    { $group: { _id: null, received: { $sum: "$amount" } } },
  ]);
  const received = receivedAgg?.received || 0;
  const remaining = receivable.totalAmount - received;
  if (parsedAmount > remaining && !allowOverpayment) {
    return { error: `Receipt (₹${parsedAmount}) exceeds the outstanding balance (₹${remaining}) on this receivable. Pass allowOverpayment to record it anyway.`, status: 400 };
  }

  const branch = branchInput || receivable.branch || authSession.user.branch;
  const transactionCategory = deriveReceiptTransactionCategory(receivable.revenueCategory);
  const routing = transactionCategory
    ? await getBankRoutingDefaults(branch, transactionCategory, method)
    : { receiptMode: "", furtherMode: "" };
  const patient = receivable.relatedPatient || (receivable.payer?.kind === "PATIENT" ? receivable.payer.refId : null);

  const transaction = await Transactions.create({
    transactionCategory, costType: "Revenue", patient: patient || undefined, amount: parsedAmount, method,
    paymentId: paymentId || "", branch, date: date ? new Date(date) : new Date(),
    remarks: remarks || `Receipt against receivable — ${receivable.payer?.label || ""}`.trim(),
    receiptMode: receiptModeInput ?? routing.receiptMode ?? "", furtherMode: furtherModeInput ?? routing.furtherMode ?? "",
    receipts: receipts || [], receivableId: receivable._id, isSettlement: receivable.costAlreadyRecognised === true,
    externalParty: externalParty && externalParty.name ? externalParty : undefined,
    createdBy: { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() },
    editors: [],
  });

  return {
    data: transaction,
    receivable: { _id: receivable._id, totalAmount: receivable.totalAmount, received: received + parsedAmount, pending: Math.max(receivable.totalAmount - (received + parsedAmount), 0) },
    status: 201,
  };
}
