// validateEntry(draft, typeKey, ctx) — ISOMORPHIC. Imported by UniversalEntryForm (client,
// pre-submit) AND by /api/entries/create (server, before touching the DB). A rule lives
// here exactly once; it can never exist on one side only (the failure mode AUDIT.md found
// repeatedly — N6, N7, and the getPaymentIdConfig/NO_GIVER_CATEGORIES duplications).
//
// `ctx.masterData` carries the live lists a cold isomorphic function can't know on its own:
// { nonCashMethods, unsettledMethods, accounts, expenseTypes(category) }. The client passes
// useMasterData()'s live arrays; the server passes the *Sync() snapshot. Neither side may
// hardcode these — this file has no import from constants/bankRouting or expenseCategories.

import { getEntryType } from "./registry.js";
import { expenseNeedsGiver, isPeriodicPurpose } from "./derive.js";

const GIVER_REFID_REQUIRED_KINDS = ["EMPLOYEE", "PATIENT", "VENDOR"];

function isBlank(v) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function checkRequiredFields(draft, def) {
  for (const key of def.required || []) {
    if (isBlank(draft[key])) {
      return `${def.label} requires "${key}"`;
    }
  }
  return null;
}

function checkAmount(draft) {
  const n = parseFloat(draft.amount);
  if (!(n > 0)) return "Enter an amount greater than zero";
  return null;
}

/** Method + routing + external-party rules shared by every payment-bearing entry type —
 * generalises TransactionFieldSet.jsx's validateTransactionFields to the whole registry. */
function checkPaymentFields(draft, { isSettlement = true } = {}, masterData) {
  const nonCash = masterData?.nonCashMethods || [];
  const unsettled = masterData?.unsettledMethods || [];

  if (!draft.method) return "Select a payment method";
  if (isSettlement && !nonCash.includes(draft.method) && !draft.routing?.furtherMode) {
    return "Select the account this money moved through — a settlement without account attribution can't be reconciled in Close Book";
  }
  if (unsettled.includes(draft.method)) {
    const p = draft.externalParty || {};
    if (!p.name?.trim()) return "Enter the name of the party who handled the money";
    if (!p.method) return "Select the method the external party used";
  }
  return null;
}

function checkGiver(giver, { label = "payee" } = {}) {
  if (!giver?.kind) return `${label}.kind is required`;
  if (!giver?.label?.trim() && !giver?.name?.trim()) return `${label}.label is required`;
  if (GIVER_REFID_REQUIRED_KINDS.includes(giver.kind) && !giver.refId) {
    return `${label}.refId is required when ${label}.kind is "${giver.kind}"`;
  }
  return null;
}

function checkLineItems(draft, revenueCategory) {
  if (!Array.isArray(draft.lineItems) || draft.lineItems.length === 0) {
    return "At least one line item is required";
  }
  for (const item of draft.lineItems) {
    if (revenueCategory === "MEDICINE") {
      if (!item.medicineId) return "Select medicine for all items";
      if (!(parseFloat(item.perUnitCost) >= 0) || !item.quantity) return "Enter valid quantity and price for all medicines";
    } else {
      if (!item.procedure) return "Select a service type for all items";
      if (!(parseFloat(item.perSessionCost) >= 0) || !item.quantity) return "Enter valid quantity and cost for all services";
    }
  }
  return null;
}

export function validateEntry(draft, typeKey, ctx = {}) {
  const def = getEntryType(typeKey);
  if (!def) return `Unknown entry type "${typeKey}"`;

  const requiredError = checkRequiredFields(draft, def);
  if (requiredError) return requiredError;

  if (def.fields.includes("amount") && !def.fields.includes("lineItems")) {
    const amountError = checkAmount(draft);
    if (amountError) return amountError;
  }

  if (def.fields.includes("lineItems")) {
    const lineError = checkLineItems(draft, def.revenueCategory);
    if (lineError) return lineError;
  }

  if (def.fields.includes("method")) {
    const isSettlement = typeKey !== "expense.vendor" && !typeKey.startsWith("revenue.");
    const paymentError = checkPaymentFields(draft, { isSettlement }, ctx.masterData);
    if (paymentError) return paymentError;
  }

  if (def.fields.includes("walkIn") && !draft.walkIn && isBlank(draft.patient)) {
    return "Select a patient or enter walk-in details";
  }
  if (draft.walkIn && (isBlank(draft.patientName) || isBlank(draft.patientPhone))) {
    return "Enter patient name and phone for a walk-in";
  }

  if (typeKey === "payable.raise") {
    const giverError = checkGiver(draft.payee, { label: "payee" });
    if (giverError) return giverError;
    if (isPeriodicPurpose(draft.purpose) && (!draft.period?.month || !draft.period?.year)) {
      return "Select the month and year this payable is for";
    }
  }
  if (typeKey === "receivable.raise") {
    const giverError = checkGiver(draft.payer, { label: "payer" });
    if (giverError) return giverError;
  }
  if (typeKey === "expense.head" && draft.expenseCategory) {
    const giver = draft.vendor
      ? { kind: "VENDOR", refId: draft.vendor, name: draft.vendor }
      : null;
    // Rent/Electricity/Collab/etc. categories don't need a giver at all (mirrors
    // expense/create/route.js's NO_GIVER_CATEGORIES via expenseNeedsGiver()); a vendor is
    // optional metadata here, not a requirement, so no giver check is applied.
    void giver;
  }
  if (typeKey === "expense.vendor" && expenseNeedsGiver(draft.expenseCategory)) {
    if (!draft.vendor && !draft.manualPayeeName?.trim()) {
      return "Enter a payee name or select a vendor";
    }
  }

  if ((typeKey === "advance.out" || typeKey === "borrowing.in") && draft.party) {
    const giverError = checkGiver(draft.party, { label: "party" });
    if (giverError) return giverError;
  }

  if (typeKey === "contra" && draft.fromAccount && draft.toAccount && draft.fromAccount === draft.toAccount) {
    return "A contra entry must move money between two different accounts";
  }

  if ((typeKey === "payable.settle" || typeKey === "borrowing.out") && draft.overBalance && !draft.allowOverpayment) {
    return "Amount exceeds the pending balance — check 'Allow overpayment' to proceed anyway";
  }
  if ((typeKey === "receivable.settle" || typeKey === "advance.in") && draft.overBalance && !draft.allowOverRecovery && !draft.allowOverpayment) {
    return "Amount exceeds the outstanding balance — check 'Allow over-recovery' to proceed anyway";
  }

  return null;
}
