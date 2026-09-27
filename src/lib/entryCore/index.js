

import { recordPatientIncentive, IncentiveError } from "@/lib/incentiveDerivation";
import { createRevenue } from "./createRevenue";
import { createExpense } from "./createExpense";
import { createPayable } from "./createPayable";
import { createReceivable } from "./createReceivable";
import { settleReceivable } from "./settleReceivable";
import { createAdvance } from "./createAdvance";
import { createBorrowing } from "./createBorrowing";
import { createContra } from "./createContra";
import { createSuspense } from "./createSuspense";
import { createCollabCase } from "./createCollabCase";
import { createCollabSettlement } from "./createCollabSettlement";

function mapThrownError(typeKey, error) {
  if (typeKey === "revenue.transplant" && error?.name === "ValidationError") {
    return { error: error.message, status: 400 };
  }
  if (typeKey === "payable.raise" && error?.code === 11000) {
    return { error: "A payable already exists for this payee/purpose/period.", status: 409 };
  }
  if ((typeKey === "advance.out" || typeKey === "advance.in") && error?.name === "ValidationError") {
    return { error: error.message, status: 400 };
  }
  if ((typeKey === "borrowing.in" || typeKey === "borrowing.out") && error?.name === "ValidationError") {
    return { error: error.message, status: 400 };
  }
  if (typeKey === "contra" && (error?.name === "ValidationError" || error?.message?.includes("contra entry"))) {
    return { error: error.message, status: 400 };
  }
  if (typeKey === "suspense" && (error?.name === "ValidationError" || error?.message?.includes("Suspense"))) {
    return { error: error.message, status: 400 };
  }
  if (typeKey === "collab.case") {
    
    
    return { error: error?.message || "Failed to create collab case", status: 400 };
  }
  return null; 
}

async function runIncentive({ payload, session: authSession }) {
  const actor = { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch };
  const performedBy = { name: authSession.user.name, email: authSession.user.email };
  try {
    const result = await recordPatientIncentive({
      patientId: payload.patient, employee: payload.employee, purpose: payload.purpose,
      amount: payload.amount, date: payload.date, branch: payload.branch, remarks: payload.remarks,
      actor, performedBy,
    });
    return { data: result.incentive, payable: result.payable, status: 201 };
  } catch (err) {
    if (err instanceof IncentiveError) return { error: err.body?.error || err.message, status: err.status };
    throw err;
  }
}

async function dispatch(typeKey, { payload, session: authSession, documentId }) {
  switch (typeKey) {
    case "revenue.transplant":
      return createRevenue("TRANSPLANT", { payload, session: authSession });
    case "revenue.service":
      return createRevenue("SERVICE", { payload, session: authSession });
    case "revenue.medicine":
      return createRevenue("MEDICINE", { payload, session: authSession });

    case "expense.agent.salary":
    case "expense.agent.incentive":
    case "expense.patient.commission":
    case "expense.patient.refund":
    case "expense.patient.other":
    case "expense.head":
    case "expense.vendor":
    case "payable.settle":
      return createExpense({ payload, session: authSession });

    case "payable.raise":
      return createPayable({ payload, session: authSession });

    case "receivable.raise":
      return createReceivable({ payload, session: authSession });

    case "receivable.settle":
      return settleReceivable({ receivableId: documentId || payload.receivableId, payload, session: authSession });

    case "advance.out":
    case "advance.in":
      return createAdvance({ payload, session: authSession });

    case "borrowing.in":
    case "borrowing.out":
      return createBorrowing({ payload, session: authSession });

    case "contra":
      return createContra({ payload, session: authSession });

    case "suspense":
      return createSuspense({ payload, session: authSession });

    case "incentive":
      return runIncentive({ payload, session: authSession });

    case "collab.case":
      return createCollabCase({ payload, session: authSession });

    case "collab.settlement":
      return createCollabSettlement({ payload, session: authSession });

    default:
      return { error: `No entryCore handler wired for "${typeKey}"`, status: 400 };
  }
}

export async function dispatchEntry(typeKey, args) {
  try {
    return await dispatch(typeKey, args);
  } catch (error) {
    const mapped = mapThrownError(typeKey, error);
    if (mapped) return mapped;
    throw error;
  }
}

export {
  createRevenue, createExpense, createPayable, createReceivable, settleReceivable,
  createAdvance, createBorrowing, createContra, createSuspense, createCollabCase, createCollabSettlement,
};
