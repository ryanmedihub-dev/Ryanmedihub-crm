// buildPayload(draft, typeKey, ctx) — draft (the engine's canonical shape) -> the exact
// body each legacy route already parses. Isomorphic. Field names on the right-hand side of
// every object below are verified against the actual route's destructuring in AUDIT.md —
// changing one here without checking the route it feeds is how a CONFLICT gets introduced.

import { getEntryType, ENTRY_TYPES } from "./registry.js";
import {
  purposeForCategory,
  categoryForPurpose,
  PAYABLE_CATEGORY_TO_FIXED_KIND,
} from "./derive.js";

const STRATEGIES = {
  revenue(draft, def, ctx) {
    const common = {
      method: draft.method,
      paymentId: draft.paymentId || "",
      branch: draft.branch,
      date: draft.date,
      remarks: draft.remarks || "",
      receiptMode: draft.routing?.receiptMode || "",
      furtherMode: draft.routing?.furtherMode || "",
      receipts: draft.receipts || [],
      receivableAllocationChoice: draft.receivableAllocationChoice,
      externalParty: draft.method === "paid_to_external" ? draft.externalParty : undefined,
    };
    if (def.singleLine) {
      return {
        ...common,
        patientId: draft.patient || undefined,
        procedure: draft.procedure,
        paymentType: draft.paymentType,
        amount: draft.amount,
        discount: draft.discount || 0,
      };
    }
    const isMedicine = def.revenueCategory === "MEDICINE";
    return {
      ...common,
      patientId: draft.walkIn ? undefined : draft.patient || undefined,
      patientName: draft.walkIn ? draft.patientName : undefined,
      patientPhone: draft.walkIn ? draft.patientPhone : undefined,
      discount: draft.discount || 0,
      [isMedicine ? "medicines" : "services"]: (draft.lineItems || []).map((item) =>
        isMedicine
          ? { medicineId: item.medicineId, quantity: item.quantity, perUnitCost: item.perUnitCost }
          : { procedure: item.procedure, quantity: item.quantity, perSessionCost: item.perSessionCost },
      ),
    };
  },

  "expense.agent"(draft, def) {
    const isSalary = def === ENTRY_TYPES["expense.agent.salary"];
    return {
      expenseCategory: def.payable.expenseCategory,
      expenseType: isSalary ? "Salary" : draft.incentiveType,
      patientId: !isSalary ? draft.relatedPatient : undefined,
      expenseGiver: { type: "EMPLOYEE", refId: draft.employee, name: ctx?.employeeName || "" },
      amount: draft.amount,
      method: draft.method,
      paymentId: draft.paymentId || "",
      branch: draft.branch,
      date: draft.date,
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      furtherMode: draft.routing?.furtherMode || "",
      receiptMode: draft.routing?.receiptMode || "",
      externalParty: draft.method === "paid_by_other" ? draft.externalParty : undefined,
    };
  },

  "expense.patient"(draft) {
    const isCommission = !!draft.commissionReceiver;
    return {
      expenseCategory: isCommission ? "Commision" : "Patient Related Expenses",
      expenseType: isCommission ? draft.commissionType : draft.expenseType || "Patient Refunds",
      patientId: draft.relatedPatient,
      amount: draft.amount,
      expenseGiver: isCommission
        ? draft.commissionReceiver
        : { type: "PATIENT", refId: draft.relatedPatient, name: ctx?.patientName || "" },
      commissionReceiver: isCommission ? draft.commissionReceiver : undefined,
      method: draft.method,
      paymentId: draft.paymentId || "",
      branch: draft.branch,
      date: draft.date,
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      furtherMode: draft.routing?.furtherMode || "",
      receiptMode: draft.routing?.receiptMode || "",
      externalParty: draft.method === "paid_by_other" ? draft.externalParty : undefined,
    };
  },

  "expense.head"(draft) {
    return {
      expenseCategory: draft.expenseCategory,
      expenseType: draft.expenseSubType,
      amount: draft.amount,
      expenseGiver: draft.vendor ? { type: "VENDOR", vendorId: draft.vendor, name: draft.vendor } : undefined,
      method: draft.method,
      paymentId: draft.paymentId || "",
      branch: draft.branch,
      date: draft.date,
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      furtherMode: draft.routing?.furtherMode || "",
      receiptMode: draft.routing?.receiptMode || "",
      externalParty: draft.method === "paid_by_other" ? draft.externalParty : undefined,
    };
  },

  "expense.vendor"(draft) {
    return {
      expenseCategory: draft.expenseCategory,
      expenseType: draft.expenseSubType,
      expenseGiver: draft.vendor
        ? { type: "VENDOR", vendorId: draft.vendor, name: undefined }
        : { type: "MANUAL", name: draft.manualPayeeName },
      amount: draft.amount,
      method: draft.method,
      paymentId: draft.paymentId || "",
      branch: draft.branch,
      date: draft.date,
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      furtherMode: draft.routing?.furtherMode || "",
      receiptMode: draft.routing?.receiptMode || "",
      externalParty: draft.method === "paid_by_other" ? draft.externalParty : undefined,
      includeGST: draft.includeGST || undefined,
      gstRate: draft.gstRate || undefined,
      gstAmount: draft.gstAmount || undefined,
      taxDetails: draft.taxDetails || undefined,
    };
  },

  payableRaise(draft) {
    const category = draft.expenseCategory || categoryForPurpose(draft.purpose);
    return {
      payee: draft.payee,
      purpose: draft.purpose || purposeForCategory(category),
      expenseCategory: category,
      expenseSubType: draft.expenseSubType || "",
      period: draft.period || undefined,
      relatedPatient: draft.relatedPatient || undefined,
      totalAmount: draft.amount,
      dueDate: draft.dueDate || undefined,
      branch: draft.branch || undefined,
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      includeGST: draft.includeGST || undefined,
      gstRate: draft.gstRate || undefined,
      gstAmount: draft.gstAmount || undefined,
      includeTDS: draft.includeTDS || undefined,
      tdsCategory: draft.tdsCategory || undefined,
      tdsRate: draft.tdsRate || undefined,
      tdsAmount: draft.tdsAmount || undefined,
    };
  },

  payableSettle(draft, def, ctx) {
    return {
      expenseCategory: ctx?.payable?.expenseCategory,
      expenseType: ctx?.payable?.expenseSubType,
      amount: draft.amount,
      method: draft.method,
      paymentId: draft.paymentId || "",
      branch: draft.branch,
      date: draft.date,
      receiptMode: draft.routing?.receiptMode || "",
      furtherMode: draft.routing?.furtherMode || "",
      receipts: draft.receipts || [],
      externalParty: draft.externalParty?.name ? draft.externalParty : undefined,
      remarks: draft.remarks || `Payment against payable — ${ctx?.payable?.payeeLabel || ""}`,
      patientId: ctx?.payable?.relatedPatient || undefined,
      expenseGiver: ctx?.giver,
      payableId: draft.payableId,
      allowOverpayment: !!draft.allowOverpayment,
    };
  },

  receivableRaise(draft) {
    return {
      payer: draft.payer,
      purpose: draft.purpose,
      revenueCategory: draft.revenueCategory || undefined,
      period: draft.period || undefined,
      relatedPatient: draft.relatedPatient || undefined,
      totalAmount: draft.amount,
      dueDate: draft.dueDate || undefined,
      branch: draft.branch || undefined,
      remarks: draft.remarks || "",
    };
  },

  receivableSettle(draft) {
    return {
      amount: draft.amount,
      date: draft.date,
      method: draft.method,
      paymentId: draft.paymentId || "",
      branch: draft.branch || "",
      receiptMode: draft.routing?.receiptMode || "",
      furtherMode: draft.routing?.furtherMode || "",
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      externalParty: draft.externalParty || {},
      allowOverpayment: !!draft.allowOverpayment,
    };
  },

  advance(draft, def) {
    return {
      direction: def.direction,
      account: draft.account,
      amount: draft.amount,
      party: def.direction === "OUT" ? draft.party : undefined,
      receivableId: draft.receivableId || undefined,
      subType: def.direction === "OUT" && !draft.receivableId ? draft.subType : undefined,
      branch: draft.branch || undefined,
      date: draft.date,
      dueDate: draft.dueDate || undefined,
      reference: draft.reference || "",
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      allowOverRecovery: !!draft.allowOverRecovery,
    };
  },

  borrowing(draft, def) {
    return {
      direction: def.direction,
      account: draft.account,
      amount: draft.amount,
      party: def.direction === "IN" ? draft.party : undefined,
      payableId: draft.payableId || undefined,
      subType: def.direction === "IN" && !draft.payableId ? draft.subType : undefined,
      branch: draft.branch || undefined,
      date: draft.date,
      reference: draft.reference || "",
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
      allowOverpayment: !!draft.allowOverpayment,
    };
  },

  contra(draft) {
    return {
      fromAccount: draft.fromAccount,
      toAccount: draft.toAccount,
      amount: draft.amount,
      date: draft.date,
      branch: draft.branch || "",
      reference: draft.reference || "",
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
    };
  },

  suspense(draft) {
    return {
      account: draft.account,
      direction: draft.direction || "IN",
      amount: draft.amount,
      date: draft.date,
      branch: draft.branch || undefined,
      reference: draft.reference || "",
      remarks: draft.remarks || "",
      receipts: draft.receipts || [],
    };
  },

  incentive(draft) {
    return {
      patient: draft.relatedPatient,
      employee: draft.employee,
      purpose: draft.incentivePurpose,
      amount: draft.amount,
      date: draft.date,
      branch: draft.branch || undefined,
      remarks: draft.remarks || "",
    };
  },

  collabCase(draft) {
    return {
      patient: draft.relatedPatient,
      clinic: draft.clinic,
      clinicShare: draft.clinicShare,
      discount: draft.discount || 0,
      ourReceived: draft.ourReceived || 0,
      clinicReceived: draft.clinicReceived || 0,
      procedure: draft.procedure,
      method: draft.method,
      paymentId: draft.paymentId || "",
      receiptMode: draft.routing?.receiptMode || "",
      furtherMode: draft.routing?.furtherMode || "",
      date: draft.date,
      remarks: draft.remarks || "",
    };
  },

  collabSettlement(draft) {
    return {
      clinic: draft.clinic,
      direction: draft.direction,
      amount: draft.amount,
      date: draft.date,
      mode: draft.mode,
      furtherMode: draft.routing?.furtherMode || "",
      receiptMode: draft.routing?.receiptMode || "",
      reference: draft.reference || "",
      // The route's own field name is `coveredCases`, not `allocations` — verified against
      // collab-settlement/settlements/create/route.js:33-43. `allocations` is only this
      // engine's internal field key (schema.js); do not rename either side casually.
      coveredCases: draft.allocations || [],
      remarks: draft.remarks || "",
    };
  },
};

export function buildPayload(draft, typeKey, ctx = {}) {
  const def = getEntryType(typeKey);
  if (!def) throw new Error(`Unknown entry type "${typeKey}"`);
  const strategy = STRATEGIES[def.buildPayload];
  if (!strategy) throw new Error(`No buildPayload strategy "${def.buildPayload}" for "${typeKey}"`);
  const payload = strategy(draft, def, ctx);
  // PAYABLE_CATEGORY_TO_FIXED_KIND / purposeForCategory are used by expense.head's caller
  // (entryCore) to resolve payee.kind server-side when raising a payable from this
  // category; re-exported here so both sides derive it the same way.
  return payload;
}

export { PAYABLE_CATEGORY_TO_FIXED_KIND };
