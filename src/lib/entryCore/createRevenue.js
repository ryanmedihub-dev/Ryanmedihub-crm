

import mongoose from "mongoose";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import Stock from "@/models/Stock";
import {
  withExternalPartyLink,
  withDbTransaction,
  createExternalReceivable,
  validateExternalParty,
} from "@/lib/externalPartyDerivation";
import { resolveReceivableAllocations } from "@/lib/receivableAllocation";

function externalPartyDoc(externalParty, direction) {
  return {
    direction,
    name: externalParty.name,
    method: externalParty.method,
    partyKind: externalParty.partyKind || "MANUAL",
    partyRefId: externalParty.partyKind && externalParty.partyKind !== "MANUAL" ? externalParty.partyRefId : null,
  };
}

async function recomputePatientPayments({ patientId, newTransactionIds, amountDelta, session }) {
  const patient = await Patient.findById(patientId).session(session || null);
  if (!patient) return null;

  patient.payments = patient.payments || {
    amountReceived: 0, pendingAmount: 0, medicineAmount: 0, discount: 0, totalAmount: 0, transactions: [],
  };
  patient.payments.transactions.push(...newTransactionIds);
  patient.payments.amountReceived += amountDelta;

  const allTransactions = await Transactions.find({
    _id: { $in: patient.payments.transactions },
    costType: "Revenue",
  }).session(session || null);
  patient.payments.discount = allTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);

  const adjustedTotal = Math.max(0, patient.payments.totalAmount - patient.payments.discount);
  patient.payments.pendingAmount = Math.max(0, adjustedTotal - patient.payments.amountReceived);
  return patient;
}

function pushPatientEditor(patient, actor) {
  patient.editors = patient.editors || [];
  patient.editors.push({ name: actor.name, email: actor.email, branch: actor.branch, date: new Date() });
}

export async function createTransplant({ payload, session: authSession }) {
  const {
    patientId, procedure, paymentType, amount, discount, method, paymentId, branch, date,
    remarks, receiptMode, furtherMode, receipts, receivableAllocationChoice, externalParty,
  } = payload;

  if (!patientId || !procedure || !amount || !method) {
    return { error: "Patient, procedure, amount, and payment method are required", status: 400 };
  }
  if (amount <= 0) return { error: "Amount must be positive", status: 400 };
  const validProcedures = ["Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant"];
  if (!validProcedures.includes(procedure)) {
    return { error: `Invalid procedure for transplant transaction. Must be one of: ${validProcedures.join(", ")}`, status: 400 };
  }
  if (!mongoose.Types.ObjectId.isValid(patientId)) return { error: "Invalid patient ID", status: 400 };
  const patientExists = await Patient.findById(patientId);
  if (!patientExists) return { error: "Patient not found", status: 404 };
  if (method === "paid_to_external") {
    const partyError = validateExternalParty(externalParty, "RECEIVED_BY");
    if (partyError) return { error: partyError, status: 400 };
  }

  const resolvedBranch = branch || authSession.user.branch;
  const createdBy = { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() };
  const txnData = {
    transactionCategory: "TRANSPLANT", costType: "Revenue", patient: patientId, procedure, paymentType,
    amount: Math.floor(Number(amount)), discount: discount || 0, method, paymentId: paymentId || "",
    branch: resolvedBranch, date: date ? new Date(date) : new Date(), remarks: remarks || "",
    receiptMode: receiptMode || "", furtherMode: furtherMode || "", receipts: receipts || [],
    createdBy, editors: [],
  };

  let newTransaction;
  if (method === "paid_to_external") {
    newTransaction = await withExternalPartyLink(async (dbSession) => {
      const [txn] = await Transactions.create(
        [{ ...txnData, receivableId: null, receivableAllocations: [], externalParty: externalPartyDoc(externalParty, "RECEIVED_BY") }],
        { session: dbSession, ordered: true },
      );
      const receivable = await createExternalReceivable({
        session: dbSession, amount: txnData.amount, name: externalParty.name, method: externalParty.method,
        partyKind: externalParty.partyKind || "MANUAL", partyRefId: externalParty.partyRefId, branch: resolvedBranch,
        transactionCategory: "TRANSPLANT", relatedPatient: patientId, actor: createdBy,
      });
      txn.externalParty.linkedReceivableId = receivable._id;
      await txn.save({ session: dbSession });
      return txn;
    });
  } else {
    try {
      newTransaction = await withDbTransaction(async (dbSession) => {
        const [{ receivableId: resolvedReceivableId, receivableAllocations }] = await resolveReceivableAllocations({
          patientId, method, itemAmounts: [txnData.amount], choice: receivableAllocationChoice, session: dbSession,
        });
        const [txn] = await Transactions.create(
          [{ ...txnData, receivableId: resolvedReceivableId, receivableAllocations }],
          { session: dbSession, ordered: true },
        );
        return txn;
      });
    } catch (allocationError) {
      return { error: allocationError.message, status: 400 };
    }
  }

  const patient = await recomputePatientPayments({
    patientId, newTransactionIds: [newTransaction._id], amountDelta: parseFloat(amount), session: null,
  });
  if (patient) {
    pushPatientEditor(patient, authSession.user);
    await patient.save();
  }

  return { data: newTransaction, updatedPatient: patient ? { _id: patient._id, payments: patient.payments } : null, status: 201 };
}

async function createLineItemRevenue({ category, payload, session: authSession }) {
  const isMedicine = category === "MEDICINE";
  const {
    patientId, patientName, patientPhone, discount, method, paymentId, branch, date, remarks,
    receiptMode, furtherMode, receipts, receivableAllocationChoice, externalParty,
  } = payload;
  const rawItems = isMedicine ? payload.medicines : payload.services;
  const items = rawItems || [
    isMedicine
      ? { medicineId: payload.medicineId, quantity: payload.quantity, perUnitCost: payload.perUnitCost }
      : { procedure: payload.procedure, quantity: payload.quantity, perSessionCost: payload.perSessionCost },
  ];

  if (!items || items.length === 0) {
    return { error: `At least one ${isMedicine ? "medicine" : "service"} is required`, status: 400 };
  }
  if (!patientId && (!patientName || !patientPhone)) {
    return { error: `Either select a patient or provide ${isMedicine ? "customer" : "walk-in"} details`, status: 400 };
  }
  if (patientId) {
    const patient = await Patient.findById(patientId);
    if (!patient) return { error: "Patient not found", status: 404 };
  }
  for (const item of items) {
    if (isMedicine) {
      if (!item.medicineId || !item.quantity || !item.perUnitCost) return { error: "Missing required fields in medicine items", status: 400 };
      const medicine = await Stock.findById(item.medicineId);
      if (!medicine) return { error: `Medicine not found: ${item.medicineId}`, status: 404 };
      if (medicine.totalQuantity < item.quantity) {
        return { error: `Insufficient stock for ${medicine.name}. Available: ${medicine.totalQuantity}`, status: 400 };
      }
    } else if (!item.procedure || !item.quantity || !item.perSessionCost) {
      return { error: "Missing required fields in service items", status: 400 };
    }
  }
  if (method === "paid_to_external") {
    const partyError = validateExternalParty(externalParty, "RECEIVED_BY");
    if (partyError) return { error: partyError, status: 400 };
  }

  const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const rateField = isMedicine ? "perUnitCost" : "perSessionCost";
  const subtotal = items.reduce((sum, item) => sum + item.quantity * parseFloat(item[rateField]), 0);
  const totalDiscount = discount || 0;
  const finalTotal = subtotal - totalDiscount;
  const resolvedBranch = branch || authSession.user.branch;
  const createdBy = { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() };

  const computeItemFinalAmount = (item) => {
    const itemSubtotal = item.quantity * parseFloat(item[rateField]);
    const itemDiscount = subtotal > 0 ? (itemSubtotal / subtotal) * totalDiscount : 0;
    return { itemDiscount, itemFinalAmount: itemSubtotal - itemDiscount };
  };

  const buildTxnDocs = (allocationsByIndex) =>
    items.map((item, idx) => {
      const { itemDiscount, itemFinalAmount } = computeItemFinalAmount(item);
      const alloc = allocationsByIndex?.[idx];
      const base = {
        transactionCategory: category, costType: "Revenue", batchId,
        patient: patientId || null, patientName: patientName || "", patientPhone: patientPhone || "",
        amount: itemFinalAmount, discount: itemDiscount, method, paymentId: paymentId || "",
        branch: resolvedBranch, date: date ? new Date(date) : new Date(), remarks: remarks || "",
        receiptMode: receiptMode || "", furtherMode: furtherMode || "", receipts: receipts || [],
        receivableId: alloc?.receivableId || null, receivableAllocations: alloc?.receivableAllocations || [],
        createdBy,
        ...(method === "paid_to_external" ? { externalParty: externalPartyDoc(externalParty, "RECEIVED_BY") } : {}),
      };
      return isMedicine
        ? { ...base, procedure: "Medicine", medicineId: item.medicineId, quantity: item.quantity, perUnitCost: parseFloat(item.perUnitCost), stock: item.medicineId }
        : { ...base, procedure: item.procedure, quantity: item.quantity, perSessionCost: parseFloat(item.perSessionCost) };
    });

  let savedTransactions;
  if (method === "paid_to_external") {
    savedTransactions = await withExternalPartyLink(async (dbSession) => {
      const txns = await Transactions.create(buildTxnDocs(), { session: dbSession, ordered: true });
      const receivable = await createExternalReceivable({
        session: dbSession, amount: finalTotal, name: externalParty.name, method: externalParty.method,
        partyKind: externalParty.partyKind || "MANUAL", partyRefId: externalParty.partyRefId, branch: resolvedBranch,
        transactionCategory: category, relatedPatient: patientId || undefined, actor: createdBy,
      });
      for (const txn of txns) {
        txn.externalParty.linkedReceivableId = receivable._id;
        await txn.save({ session: dbSession });
      }
      return txns;
    });
  } else {
    try {
      savedTransactions = await withDbTransaction(async (dbSession) => {
        const itemAmounts = items.map((item) => computeItemFinalAmount(item).itemFinalAmount);
        const allocations = await resolveReceivableAllocations({ patientId, method, itemAmounts, choice: receivableAllocationChoice, session: dbSession });
        return Transactions.create(buildTxnDocs(allocations), { session: dbSession, ordered: true });
      });
    } catch (allocationError) {
      return { error: allocationError.message, status: 400 };
    }
  }

  
  
  
  if (isMedicine) {
    for (const item of items) {
      await Stock.findByIdAndUpdate(item.medicineId, { $inc: { totalQuantity: -item.quantity } });
    }
  }

  
  
  let updatedPatient = null;
  if (!isMedicine && patientId) {
    const patient = await recomputePatientPayments({
      patientId, newTransactionIds: savedTransactions.map((t) => t._id), amountDelta: finalTotal, session: null,
    });
    if (patient) {
      pushPatientEditor(patient, authSession.user);
      await patient.save();
      updatedPatient = { _id: patient._id, payments: patient.payments };
    }
  }

  return {
    data: savedTransactions, batchId,
    summary: { totalItems: items.length, subtotal, discount: totalDiscount, finalTotal },
    updatedPatient, status: 201,
  };
}

export const createService = (args) => createLineItemRevenue({ category: "SERVICE", ...args });
export const createMedicine = (args) => createLineItemRevenue({ category: "MEDICINE", ...args });

export async function createRevenue(category, args) {
  if (category === "TRANSPLANT") return createTransplant(args);
  if (category === "SERVICE") return createService(args);
  if (category === "MEDICINE") return createMedicine(args);
  return { error: `Unknown revenue category "${category}"`, status: 400 };
}
