// Pure, isomorphic derivations for the entry engine — zero browser-only or Node-only
// imports, so the exact same functions run inside UniversalEntryForm (client) and inside
// the /api/entries/create route (server). Nothing here talks to a database or to master
// data; it only maps a registry type key to the fields the legacy routes already expect.

// Canonical expense-category -> payable-purpose map. Replaces the three independently
// maintained copies found in AUDIT.md's N2: getPayableContext.js's PAYABLE_CATEGORY_PURPOSE
// (9/14 purposes), vouchers/page.jsx's CATEGORY_TO_PURPOSE (10/14), and NewPayableModal.jsx's
// inverse PURPOSE_TO_CATEGORY (14/14, the widest of the three — used as the base here).
// SOFTWARE_RENTAL and COLLAB_CLINIC are both present, closing the gap N2 documented (raising
// a Software Rental payable was previously unreachable from 2 of 3 screens). This is the one
// map any surface reads once its own migration step repoints it here — see the migration
// order in the Phase B brief; getPayableContext.js and vouchers/page.jsx are NOT repointed
// by this step, only by their own (step 3 / step 6), so today's behaviour for those two
// files is unchanged until then.
export const CATEGORY_TO_PAYABLE_PURPOSE = {
  Rent: "RENT",
  "Electricity Bill": "ELECTRICITY",
  "Collab Clinic Payment": "COLLAB_CLINIC",
  Salary: "SALARY",
  Incentive: "INCENTIVE",
  Commision: "PATIENT_COMMISSION",
  "Medical Consumables": "MEDICAL_CONSUMABLES",
  "Medicine Procurement": "MEDICINE_PROCUREMENT",
  "Professional Expenses": "PROFESSIONAL_EXPENSES",
  "Lab Expenses": "LAB_EXPENSES",
  "Interest Expenses": "INTEREST_EXPENSES",
  Taxes: "TAX",
  "Hardware Rental Expenses": "HARDWARE_RENTAL",
  "Software Rental Expenses": "SOFTWARE_RENTAL",
};

export const PAYABLE_PURPOSE_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_TO_PAYABLE_PURPOSE).map(([category, purpose]) => [purpose, category]),
);

// payee.kind for the categories that don't route through Employee/Patient/Vendor.
export const PAYABLE_CATEGORY_TO_FIXED_KIND = {
  Rent: "RENT_UNIT",
  "Electricity Bill": "UTILITY_UNIT",
  "Collab Clinic Payment": "COLLAB_CLINIC",
};

export function purposeForCategory(category) {
  return CATEGORY_TO_PAYABLE_PURPOSE[category] || null;
}

export function categoryForPurpose(purpose) {
  return PAYABLE_PURPOSE_TO_CATEGORY[purpose] || null;
}

// transactionCategory / costType each registry type produces on the Transactions model —
// mirrors what every legacy create route already hardcodes. "receivable.settle" has no
// static transactionCategory; see deriveReceiptTransactionCategory below, which mirrors
// receivables/[id]/receipt/route.js exactly.
const TYPE_TRANSACTION_SHAPE = {
  "revenue.transplant": { transactionCategory: "TRANSPLANT", costType: "Revenue" },
  "revenue.service": { transactionCategory: "SERVICE", costType: "Revenue" },
  "revenue.medicine": { transactionCategory: "MEDICINE", costType: "Revenue" },
  "expense.agent.salary": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.agent.incentive": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.patient.commission": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.patient.refund": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.patient.other": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.head": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.vendor": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "payable.settle": { transactionCategory: "EXPENSE", costType: "Expenses" },
};

export function transactionShapeForType(typeKey) {
  return TYPE_TRANSACTION_SHAPE[typeKey] || null;
}

// Mirrors receivables/[id]/receipt/route.js:15-20 exactly. Do not widen this map without
// checking that route — a receivable whose revenueCategory isn't one of these three
// legitimately gets no transactionCategory today (left to the Transactions model's own
// pre-save derivation). That's existing, intentional behaviour per AUDIT.md, not a gap.
const REVENUE_CATEGORY_TO_TRANSACTION_CATEGORY = {
  transplant: "TRANSPLANT",
  service: "SERVICE",
  services: "SERVICE",
  medicine: "MEDICINE",
};

export function deriveReceiptTransactionCategory(revenueCategory) {
  return REVENUE_CATEGORY_TO_TRANSACTION_CATEGORY[String(revenueCategory || "").toLowerCase()];
}

// Set identically in three legacy routes (expense/create, receivables/[id]/receipt,
// collab-settlement/settlements/create) from the target document's own
// costAlreadyRecognised flag. Naming the rule once so entryCore doesn't re-derive it
// three different ways.
export function deriveIsSettlement(targetDoc) {
  return targetDoc?.costAlreadyRecognised === true;
}

// Byte-identical to expense/create/route.js's NO_GIVER_CATEGORIES (AUDIT.md N5) — kept as
// a literal here, NOT derived from EXPENSE_CATEGORY.settlementType/ownedElsewhere. Those
// two fields don't cleanly reproduce this exact 7-category set: Salary/Incentive/Commision
// are "PAYABLE, ownedElsewhere"; Rent/Electricity Bill/Collab Clinic Payment are "PAYABLE,
// NOT ownedElsewhere"; Patient Related Expenses is "DIRECT". No settlementType/ownedElsewhere
// combination isolates exactly these seven, so deriving it would either misclassify some
// category or silently diverge from what expense/create/route.js still enforces server-side.
// Turning this into a true master-data-driven flag needs a new boolean field on
// EXPENSE_CATEGORY rows — a schema change, which per the project's rules is a separate,
// explicit proposal, not something to bundle into this step. This constant at least
// collapses the two previously-independent mechanisms (the backend's literal array and the
// frontend's resolveExpenseSection()-implied grouping) into one place engine consumers read.
export const EXPENSE_NO_GIVER_CATEGORIES = [
  "Salary",
  "Incentive",
  "Commision",
  "Patient Related Expenses",
  "Rent",
  "Electricity Bill",
  "Collab Clinic Payment",
];

export function expenseNeedsGiver(expenseCategory) {
  return !EXPENSE_NO_GIVER_CATEGORIES.includes(expenseCategory);
}

// expenseCategory a purpose-driven payable-raising entry type submits, and whether the
// purpose is periodic (hits Payable's unique payee+purpose+period index — see
// models/Payable.js's MONTHLY_PURPOSES).
export const MONTHLY_PAYABLE_PURPOSES = ["SALARY", "RENT", "ELECTRICITY", "COLLAB_CLINIC", "TAX"];

export function isPeriodicPurpose(purpose) {
  return MONTHLY_PAYABLE_PURPOSES.includes(purpose);
}
