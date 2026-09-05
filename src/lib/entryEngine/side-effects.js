// Declarative description of what each entry type must produce, transcribed from
// AUDIT.md's Side-effects Inventory. Consumed by the acceptance scripts under
// scripts/entry-acceptance/ so a script asserts against this list instead of hardcoding
// its own copy of "what should happen" — one more place a rule would otherwise live twice.
//
// `transactional: true` means the whole effect commits or none of it does (a Mongo session
// wraps every write). `transactional: false` means at least one step is best-effort/
// un-sessioned in the legacy route being extracted — faithfully carried over, not fixed
// (see the `knownDefect` pointer to AUDIT.md).

export const SIDE_EFFECTS = {
  "revenue.transplant": {
    transactional: true,
    effects: [
      "Transactions doc, costType=Revenue, transactionCategory=TRANSPLANT",
      "receivableAllocationChoice resolved against open receivables OR external receivable raised (paid_to_external)",
      "patient.payments.{transactions,amountReceived,discount,pendingAmount} recomputed",
      "patient.editors[] appended",
    ],
  },
  "revenue.service": {
    transactional: true,
    effects: [
      "Transactions doc per line item, one shared batchId",
      "receivableAllocationChoice resolved OR external receivable raised",
      "patient.payments recomputed (sum of all lines' discount+amount)",
      "patient.editors[] appended",
    ],
  },
  "revenue.medicine": {
    transactional: false,
    knownDefect: "AUDIT.md B1 — patient.payments is never touched; stock decrement runs after the session commits and is itself unsessioned.",
    effects: [
      "Transactions doc per line item, one shared batchId",
      "Stock.totalQuantity decremented per line (post-commit, unsessioned)",
      "receivableAllocationChoice resolved OR external receivable raised",
    ],
  },
  "expense.agent.salary": {
    transactional: true,
    effects: [
      "Transactions doc, costType=Expenses",
      "optional payableId link + live overpayment guard",
    ],
  },
  "expense.agent.incentive": {
    transactional: true,
    effects: ["Transactions doc, costType=Expenses", "optional payableId link + live overpayment guard"],
  },
  "expense.patient.commission": {
    transactional: true,
    effects: ["Transactions doc with commissionReceiver mirrored from expenseGiver"],
  },
  "expense.patient.refund": { transactional: true, effects: ["Transactions doc, expenseCategory=Patient Related Expenses, expenseType=Patient Refunds"] },
  "expense.patient.other": { transactional: true, effects: ["Transactions doc, expenseCategory=Patient Related Expenses"] },
  "expense.head": { transactional: true, effects: ["Transactions doc", "optional payableId link + live overpayment guard"] },
  "expense.vendor": {
    transactional: true,
    effects: [
      "Transactions doc",
      "vendorDoc.Transactions pointer + vendorDoc.editors[] appended when a vendor is named",
      "optional GST fold-in via taxDetails (display-only, per NOTES.md — never a separate GST payable)",
    ],
  },
  "payable.raise": {
    transactional: true,
    effects: ["Payable doc + log[] entry", "optional second, linked TDS Payable doc when includeTDS"],
  },
  "payable.settle": {
    transactional: true,
    effects: ["Transactions doc with payableId", "isSettlement = payable.costAlreadyRecognised", "live overpayment guard unless allowOverpayment"],
  },
  "receivable.raise": { transactional: true, effects: ["Receivable doc + log[] entry"] },
  "receivable.settle": {
    transactional: false,
    knownDefect: "AUDIT.md B1/N10 — patient.payments is never touched even when the receivable resolves to a patient; no period-lock check.",
    effects: ["Transactions doc with receivableId", "isSettlement = receivable.costAlreadyRecognised", "live overpayment guard unless allowOverpayment"],
  },
  "advance.out": { transactional: true, effects: ["Advance doc + log[]", "new or topped-up linked Receivable + log[]", "excludeFromPnl=true on a newly-raised receivable"] },
  "advance.in": { transactional: true, effects: ["Advance doc + log[] — single document, no session needed", "live over-recovery guard unless allowOverRecovery"] },
  "borrowing.in": { transactional: true, effects: ["Borrowing doc + log[]", "new or topped-up linked Payable + log[]", "excludeFromPnl=true on a newly-raised payable"] },
  "borrowing.out": { transactional: true, effects: ["Borrowing doc + log[] — single document, no session needed", "live overpayment guard unless allowOverpayment"] },
  contra: { transactional: true, effects: ["AccountTransfer doc + log[] — single document", "post-save non-blocking negative-balance warning — never fails the request"] },
  suspense: { transactional: true, effects: ["SuspenseEntry doc + log[] — single document"] },
  incentive: {
    transactional: true,
    effects: [
      "Payable(INCENTIVE) opened or found for employee+month",
      "Patient.incentives[] row pushed, with its own log[]",
      "Payable.totalAmount recomputed from all active incentive rows; refuses to drop below what's already paid",
    ],
  },
  "collab.case": { transactional: true, effects: ["CollabCase doc via createCollabCaseAtomic()", "linked clinicSharePayable / clinicShareReceivable"] },
  "collab.settlement": {
    transactional: false,
    knownDefect: "AUDIT.md B3 — settlement.save() happens before the per-case Transactions loop, which is un-sessioned; a mid-loop failure still returns 201.",
    effects: ["CollabSettlement doc", "one Transactions doc per allocated case (best-effort)"],
  },
};

export function sideEffectsFor(typeKey) {
  return SIDE_EFFECTS[typeKey] || null;
}
