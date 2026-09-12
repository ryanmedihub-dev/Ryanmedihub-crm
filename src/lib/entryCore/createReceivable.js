// Extracted from receivables/create/route.js's POST handler — used by "receivable.raise".

import Receivable, { RECEIVABLE_KIND_VALUES, RECEIVABLE_PURPOSE_VALUES } from "@/models/Receivable";
import { ALL_BRANCHES } from "@/lib/branches";

const PATIENT_REQUIRED_PURPOSES = ["PATIENT_DUE", "REFUND_DUE", "ADVANCE_RECOVERY"];

export async function createReceivable({ payload, session: authSession }) {
  const { payer, purpose, revenueCategory, period, relatedPatient, totalAmount, dueDate, branch, remarks, costAlreadyRecognised, receipts } = payload;

  if (!payer?.kind || !payer?.label || !purpose || !totalAmount || totalAmount <= 0) {
    return { error: "Missing required fields", status: 400 };
  }
  if (!RECEIVABLE_KIND_VALUES.includes(payer.kind)) return { error: "Invalid payer.kind", status: 400 };
  if (!RECEIVABLE_PURPOSE_VALUES.includes(purpose)) return { error: "Invalid purpose", status: 400 };
  const REFID_REQUIRED_KINDS = ["PATIENT", "EMPLOYEE", "VENDOR"];
  if (REFID_REQUIRED_KINDS.includes(payer.kind) && !payer.refId) {
    return { error: `payer.refId is required when payer.kind is "${payer.kind}"`, status: 400 };
  }
  if (PATIENT_REQUIRED_PURPOSES.includes(purpose) && !relatedPatient) {
    return { error: "relatedPatient is required for this purpose", status: 400 };
  }
  if (branch && !ALL_BRANCHES.includes(branch)) return { error: "Invalid branch", status: 400 };

  const performedBy = { name: authSession.user.name, email: authSession.user.email };
  const receivable = new Receivable({
    payer: { kind: payer.kind, refId: payer.refId || null, label: payer.label },
    purpose, revenueCategory, period: period?.month && period?.year ? period : undefined,
    relatedPatient: relatedPatient || undefined, totalAmount: parseFloat(totalAmount),
    // Every receivable needs a dueDate for the ledger pages' date-range filter to ever see it.
    dueDate: dueDate ? new Date(dueDate) : new Date(), branch: branch || authSession.user.branch,
    remarks: remarks || "", costAlreadyRecognised: costAlreadyRecognised === true, receipts: receipts || [],
    createdBy: { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() },
  });
  receivable.log.push({ action: "Created", newValue: String(receivable.totalAmount), performedBy, performedAt: new Date() });
  await receivable.save();

  return { data: receivable, status: 201 };
}
