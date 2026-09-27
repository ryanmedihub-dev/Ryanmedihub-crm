

import mongoose from "mongoose";
import Transactions from "@/models/Transactions";
import Vendor from "@/models/Vendor";
import Payable from "@/models/Payable";
import { withExternalPartyLink, createExternalPayable, validateExternalParty } from "@/lib/externalPartyDerivation";
import { expenseTypesSync, nonCashMethodsSync } from "@/lib/masterData";
import { EXPENSE_NO_GIVER_CATEGORIES } from "@/lib/entryEngine/derive";

export async function createExpense({ payload, session: authSession, dbSession = null }) {
  const {
    expenseCategory, expenseType, expenseGiver, amount, method, paymentId, branch, date, remarks,
    patientId, commissionReceiver, payableId, allowOverpayment, receipts, furtherMode, receiptMode,
    externalParty, taxDetails, advanceSettlementIds,
  } = payload;

  if (!expenseCategory || !amount) return { error: "Missing required fields", status: 400 };

  
  
  
  if (dbSession && method === "paid_by_other") {
    return { error: "Advance settlement is not supported with 'Paid by Other'", status: 400 };
  }

  if (payableId && furtherMode !== undefined && !furtherMode && !nonCashMethodsSync().includes(method)) {
    return { error: "furtherMode is required — name the account this payment left from", status: 400 };
  }

  const needsGiver = !EXPENSE_NO_GIVER_CATEGORIES.includes(expenseCategory);
  if (needsGiver && !expenseGiver) return { error: "Missing required fields", status: 400 };

  if (expenseTypesSync(expenseCategory).length > 0 && !expenseType) {
    return { error: "Expense type is required for this category", status: 400 };
  }

  if (needsGiver) {
    if (!expenseGiver.type) return { error: "Invalid expense giver data", status: 400 };
    if ((expenseGiver.type === "EMPLOYEE" || expenseGiver.type === "PATIENT") && (!expenseGiver.refId || !expenseGiver.name)) {
      return { error: "Employee/patient reference and name are required", status: 400 };
    }
    if (expenseGiver.type === "MANUAL" && !expenseGiver.name) return { error: "Payee name is required", status: 400 };
  }

  let vendorDoc = null;
  if (expenseGiver?.type === "VENDOR") {
    if (!expenseGiver.vendorId) return { error: "Vendor ID required for vendor expenses", status: 400 };
    vendorDoc = await Vendor.findById(expenseGiver.vendorId).session(dbSession);
    if (!vendorDoc) return { error: "Vendor not found", status: 404 };
  }

  let payableDoc = null;
  if (payableId) {
    payableDoc = await Payable.findById(payableId).session(dbSession);
    if (!payableDoc) return { error: "Payable not found", status: 404 };
    if (payableDoc.isCancelled) return { error: "This payable has been cancelled", status: 400 };

    
    
    
    const [paidAgg] = await Transactions.aggregate([
      { $match: { payableId: payableDoc._id, approvalStatus: "APPROVED" } },
      { $group: { _id: null, paid: { $sum: "$amount" } } },
    ]).session(dbSession);
    const currentPaid = paidAgg?.paid || 0;
    const remaining = payableDoc.totalAmount - currentPaid;
    if (parseFloat(amount) > remaining && !allowOverpayment) {
      return {
        error: `Payment (₹${amount}) exceeds the remaining balance (₹${remaining}) on this payable. Pass allowOverpayment to record it anyway.`,
        status: 400,
      };
    }
  }

  if (method === "paid_by_other") {
    const partyError = validateExternalParty(externalParty, "PAID_BY");
    if (partyError) return { error: partyError, status: 400 };
  }

  const transactionData = {
    transactionCategory: "EXPENSE", costType: "Expenses", expense: expenseCategory, expenseType: expenseType || "",
    expenseGiver: expenseGiver
      ? {
          type: expenseGiver.type,
          vendorId: expenseGiver.type === "VENDOR" ? expenseGiver.vendorId : null,
          refId: expenseGiver.type === "EMPLOYEE" || expenseGiver.type === "PATIENT" ? expenseGiver.refId : null,
          name: expenseGiver.name,
        }
      : undefined,
    patient: patientId || undefined,
    commissionReceiver: expenseCategory === "Commision" && commissionReceiver
      ? { type: commissionReceiver.type, refId: commissionReceiver.type === "MANUAL" ? undefined : commissionReceiver.refId, name: commissionReceiver.name }
      : undefined,
    payableId: payableId || null,
    amount: parseFloat(amount), method, paymentId: paymentId || "", branch: branch || authSession.user.branch,
    date: date ? new Date(date) : new Date(), remarks: remarks || "", receipts: receipts || [],
    furtherMode: furtherMode || "", receiptMode: receiptMode || "",
    isSettlement: payableDoc ? payableDoc.costAlreadyRecognised === true : false,
    taxDetails: taxDetails || undefined,
    ...(Array.isArray(advanceSettlementIds) && advanceSettlementIds.length
      ? { advanceSettlementIds }
      : {}),
    vendor: expenseGiver?.type === "VENDOR" ? expenseGiver.vendorId : null,
    approvalStatus: "APPROVED",
    createdBy: { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() },
  };

  const resolvedBranch = branch || authSession.user.branch;
  let transaction;
  if (method === "paid_by_other") {
    transaction = await withExternalPartyLink(async (dbSession) => {
      const [txn] = await Transactions.create(
        [{
          ...transactionData,
          externalParty: {
            direction: "PAID_BY", name: externalParty.name, method: externalParty.method,
            partyKind: externalParty.partyKind || "MANUAL",
            partyRefId: externalParty.partyKind && externalParty.partyKind !== "MANUAL" ? externalParty.partyRefId : null,
          },
        }],
        { session: dbSession, ordered: true },
      );
      const payable = await createExternalPayable({
        session: dbSession, amount: transactionData.amount, name: externalParty.name, method: externalParty.method,
        partyKind: externalParty.partyKind || "MANUAL", partyRefId: externalParty.partyRefId, branch: resolvedBranch,
        relatedPatient: patientId || undefined, actor: transactionData.createdBy,
        settledPayableLabel: payableDoc?.payee?.label,
      });
      txn.externalParty.linkedPayableId = payable._id;
      await txn.save({ session: dbSession });
      return txn;
    });
  } else {
    transaction = new Transactions(transactionData);
    await transaction.save({ session: dbSession });
  }

  if (vendorDoc) {
    const previousValue = vendorDoc.Transactions?.toString() || "null";
    vendorDoc.Transactions = transaction._id;
    vendorDoc.editors.push({
      name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date(),
      updatedFields: [{ name: "Transactions", previousValue, newValue: transaction._id.toString() }],
    });
    await vendorDoc.save({ session: dbSession });
  }

  return { data: transaction, status: 201 };
}
