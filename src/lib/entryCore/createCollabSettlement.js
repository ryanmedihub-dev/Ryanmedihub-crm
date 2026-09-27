

import CollabSettlement from "@/models/CollabSettlement";
import CollabCase from "@/models/CollabCase";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import { COLLAB_BRANCHES } from "@/lib/branches";
import { deriveReceiptTransactionCategory } from "@/lib/entryEngine/derive";

export async function createCollabSettlement({ payload, session: authSession }) {
  const { clinic, direction, amount, date, mode, reference, remarks, receiptMode, furtherMode, coveredCases } = payload;

  if (!clinic || !direction || !amount || amount <= 0) return { error: "Missing required fields", status: 400 };
  if (!COLLAB_BRANCHES.includes(clinic)) return { error: "Invalid clinic — must be a collab branch", status: 400 };
  if (!["WE_PAID", "THEY_PAID"].includes(direction)) return { error: "Invalid direction", status: 400 };

  const parsedAmount = parseFloat(amount);
  const allocations = Array.isArray(coveredCases) ? coveredCases.filter((c) => c?.case && c.amount > 0) : [];
  const allocatedTotal = allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
  if (allocatedTotal > parsedAmount) {
    return { error: "Allocated amounts across covered cases exceed the settlement amount", status: 400 };
  }

  const performedBy = { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch };
  const settlement = new CollabSettlement({
    clinic, direction, amount: parsedAmount, date: date ? new Date(date) : new Date(), mode, reference: reference || "",
    coveredCases: allocations.map((a) => ({ case: a.case, amount: parseFloat(a.amount) })),
    remarks: remarks || "", createdBy: { ...performedBy, date: new Date() },
  });
  await settlement.save();

  const generatedTransactionIds = [];
  const skippedAllocations = [];

  try {
    if (direction === "WE_PAID") {
      for (const allocation of allocations) {
        const collabCase = await CollabCase.findById(allocation.case).select("clinic clinicSharePayable");
        if (!collabCase || collabCase.clinic !== clinic) continue;
        if (!collabCase.clinicSharePayable) {
          skippedAllocations.push({ case: allocation.case, reason: "This case has no payable to settle (nothing was owed to the clinic for it)." });
          continue;
        }
        const expenseTx = await Transactions.create({
          transactionCategory: "EXPENSE", costType: "Expenses", expense: "Collab Clinic Payment", expenseType: "Collab Clinic Payment",
          expenseGiver: { type: "MANUAL", name: clinic }, amount: parseFloat(allocation.amount), method: mode, paymentId: reference || "",
          furtherMode: furtherMode || "", branch: clinic, date: settlement.date, remarks: remarks || `Collab settlement — ${clinic}`,
          approvalStatus: "APPROVED", payableId: collabCase.clinicSharePayable, collabRef: { settlementId: settlement._id, caseId: allocation.case },
          createdBy: { ...performedBy, date: new Date() },
        });
        generatedTransactionIds.push(expenseTx._id);
      }

      const unallocated = Math.round((parsedAmount - allocatedTotal) * 100) / 100;
      if (unallocated > 0.005) {
        const expenseTx = await Transactions.create({
          transactionCategory: "EXPENSE", costType: "Expenses", expense: "Collab Clinic Payment", expenseType: "Collab Clinic Payment",
          expenseGiver: { type: "MANUAL", name: clinic }, amount: unallocated, method: mode, paymentId: reference || "",
          furtherMode: furtherMode || "", branch: clinic, date: settlement.date, remarks: remarks || `Collab settlement — ${clinic}`,
          approvalStatus: "APPROVED", collabRef: { settlementId: settlement._id }, createdBy: { ...performedBy, date: new Date() },
        });
        generatedTransactionIds.push(expenseTx._id);
      }
    } else if (direction === "THEY_PAID" && allocations.length > 0) {
      for (const allocation of allocations) {
        const collabCase = await CollabCase.findById(allocation.case).select("patient procedure clinic clinicShareReceivable");
        if (!collabCase || collabCase.clinic !== clinic) continue;
        if (!collabCase.clinicShareReceivable) {
          skippedAllocations.push({ case: allocation.case, reason: "This case has no receivable to settle (the clinic never collected more than its share for it)." });
          continue;
        }
        const receivable = await Receivable.findById(collabCase.clinicShareReceivable).select("revenueCategory costAlreadyRecognised isCancelled");
        if (!receivable || receivable.isCancelled) {
          skippedAllocations.push({ case: allocation.case, reason: "This case's receivable no longer exists or was cancelled." });
          continue;
        }

        const transactionCategory = deriveReceiptTransactionCategory(receivable.revenueCategory);
        const revenueTx = await Transactions.create({
          transactionCategory, procedure: collabCase.procedure, costType: "Revenue", patient: collabCase.patient,
          amount: parseFloat(allocation.amount), method: mode, paymentId: reference || "", receiptMode: receiptMode || "",
          furtherMode: furtherMode || "", branch: clinic, date: settlement.date, paymentType: "Other", approvalStatus: "APPROVED",
          receivableId: receivable._id, isSettlement: receivable.costAlreadyRecognised === true,
          collabRef: { settlementId: settlement._id, caseId: allocation.case }, createdBy: { ...performedBy, date: new Date() },
          remarks: remarks || `Collab settlement — ${clinic}`,
        });
        generatedTransactionIds.push(revenueTx._id);
      }
    }

    if (generatedTransactionIds.length) {
      settlement.generatedTransactions = generatedTransactionIds;
      await settlement.save();
    }
    if (skippedAllocations.length) {
      console.warn("Collab settlement — some allocations had nothing to settle:", skippedAllocations);
    }
  } catch (txError) {
    console.error("Settlement saved, but linked transaction creation failed:", txError);
  }

  return { data: settlement, skippedAllocations, status: 201 };
}
