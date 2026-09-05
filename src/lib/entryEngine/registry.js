// The single declarative source of truth for every entry type the universal engine can
// record (Phase B brief §3.1's acceptance list). Isomorphic — no browser-only or Node-only
// imports — so both UniversalEntryForm (client) and /api/entries/create (server) read the
// exact same definitions.
//
// What belongs here vs. what doesn't:
//   - Real, fixed enums (payee/party kinds, Mongoose purpose enums) are fine as literals —
//     they're schema, not runtime-editable data.
//   - Category/method/account lists are NEVER hardcoded here — every consumer must resolve
//     them from master data (useMasterData() client-side, *Sync() server-side) at render/
//     validate time. `fields` below only names which field SLOTS render, not their options.
//   - `endpoint` names the LEGACY route this type still posts to today. Per the migration
//     order this stays true until each surface's own step flips it to POST
//     /api/entries/create — building this registry does not repoint any existing UI.

export const ENTRY_GROUPS = ["Revenue", "Expense", "Payable", "Receivable", "Financing", "Other"];

export const ENTRY_TYPES = {
  "revenue.transplant": {
    label: "Transplant",
    group: "Revenue",
    roles: ["admin", "super-admin", "sales", "reception", "collab", "stock"],
    fields: [
      "patient", "procedure", "paymentType", "amount", "discount",
      "method", "paymentId", "routing", "externalParty",
      "receivableAllocationChoice", "branch", "date", "remarks", "receipts",
    ],
    required: ["patient", "procedure", "paymentType", "amount", "method", "branch"],
    endpoint: "/api/transactions/transplant/create",
    buildPayload: "revenue",
    revenueCategory: "TRANSPLANT",
    singleLine: true,
    sideEffects: ["transaction", "receivableAllocationOrExternalReceivable", "patientPaymentsRecompute", "patientEditors"],
  },

  "revenue.service": {
    label: "Service (PRP/GFC)",
    group: "Revenue",
    roles: ["admin", "super-admin", "sales", "reception", "collab", "stock"],
    fields: [
      "patient", "walkIn", "lineItems", "discount",
      "method", "paymentId", "routing", "externalParty",
      "receivableAllocationChoice", "branch", "date", "remarks", "receipts",
    ],
    required: ["lineItems", "amount", "method", "branch"],
    endpoint: "/api/transactions/service/create",
    buildPayload: "revenue",
    revenueCategory: "SERVICE",
    multiLine: true,
    sideEffects: ["transactionPerLine", "sharedBatchId", "receivableAllocationOrExternalReceivable", "patientPaymentsRecompute", "patientEditors"],
  },

  "revenue.medicine": {
    label: "Medicine Sale",
    group: "Revenue",
    roles: ["admin", "super-admin", "sales", "reception", "collab", "stock"],
    fields: [
      "patient", "walkIn", "lineItems", "discount",
      "method", "paymentId", "routing", "externalParty",
      "receivableAllocationChoice", "branch", "date", "remarks", "receipts",
    ],
    required: ["lineItems", "amount", "method", "branch"],
    endpoint: "/api/transactions/medicine/create",
    buildPayload: "revenue",
    revenueCategory: "MEDICINE",
    multiLine: true,
    // NOTE: unlike revenue.transplant/revenue.service, medicine/create/route.js never
    // recomputes patient.payments (AUDIT.md B1/N-finding). Preserved as-is here — not a
    // registry bug, a faithful description of what the legacy route actually does today.
    sideEffects: ["transactionPerLine", "sharedBatchId", "stockDecrement", "receivableAllocationOrExternalReceivable"],
  },

  "expense.agent.salary": {
    label: "Salary",
    group: "Expense",
    roles: ["admin", "super-admin"],
    fields: [
      "employee", "period", "amount", "date", "branch",
      "method", "paymentId", "routing", "externalParty", "remarks", "receipts",
    ],
    required: ["employee", "amount", "branch", "method", "period"],
    payable: {
      purpose: "SALARY",
      payeeKind: "EMPLOYEE",
      expenseCategory: "Salary",
      expenseSubType: "Salary",
      periodic: true,
      allowRaise: true,
      allowSettle: true,
    },
    endpoint: "/api/transactions/expense/create",
    buildPayload: "expense.agent",
    sideEffects: ["transaction", "payableLink", "auditTrail"],
  },

  "expense.agent.incentive": {
    label: "Incentive (payment)",
    group: "Expense",
    roles: ["admin", "super-admin"],
    fields: [
      "employee", "incentiveType", "relatedPatient", "amount", "date", "branch",
      "method", "paymentId", "routing", "externalParty", "remarks", "receipts",
    ],
    required: ["employee", "incentiveType", "relatedPatient", "amount", "branch", "method"],
    payable: {
      purpose: "INCENTIVE",
      payeeKind: "EMPLOYEE",
      expenseCategory: "Incentive",
      periodic: false,
      allowRaise: false,
      allowSettle: true,
    },
    endpoint: "/api/transactions/expense/create",
    buildPayload: "expense.agent",
    sideEffects: ["transaction", "payableLink", "auditTrail"],
    // The obligation itself (Patient.incentives[] row + opening/topping-up the payable) is
    // NOT this type — that's the separate `incentive` type below, which is the one place in
    // the audited system that was already genuinely single-sourced (recordPatientIncentive).
  },

  "expense.patient.commission": {
    label: "Referral Commission",
    group: "Expense",
    roles: ["admin", "super-admin"],
    fields: [
      "relatedPatient", "commissionReceiver", "commissionType", "amount", "date", "branch",
      "method", "paymentId", "routing", "externalParty", "remarks", "receipts",
    ],
    required: ["relatedPatient", "commissionReceiver", "amount", "branch", "method"],
    payable: {
      purpose: "PATIENT_COMMISSION",
      periodic: false,
      allowRaise: false,
      allowSettle: true,
    },
    endpoint: "/api/transactions/expense/create",
    buildPayload: "expense.patient",
    sideEffects: ["transaction", "auditTrail"],
  },

  "expense.patient.refund": {
    label: "Patient Refund",
    group: "Expense",
    roles: ["admin", "super-admin"],
    fields: ["relatedPatient", "amount", "date", "branch", "method", "paymentId", "routing", "externalParty", "remarks", "receipts"],
    required: ["relatedPatient", "amount", "branch", "method"],
    fixedExpenseCategory: "Patient Related Expenses",
    fixedExpenseType: "Patient Refunds",
    endpoint: "/api/transactions/expense/create",
    buildPayload: "expense.patient",
    sideEffects: ["transaction", "auditTrail"],
  },

  "expense.patient.other": {
    label: "Patient-Related Expense",
    group: "Expense",
    roles: ["admin", "super-admin"],
    fields: ["relatedPatient", "expenseType", "amount", "date", "branch", "method", "paymentId", "routing", "externalParty", "remarks", "receipts"],
    required: ["relatedPatient", "expenseType", "amount", "branch", "method"],
    fixedExpenseCategory: "Patient Related Expenses",
    endpoint: "/api/transactions/expense/create",
    buildPayload: "expense.patient",
    sideEffects: ["transaction", "auditTrail"],
  },

  "expense.head": {
    label: "Rent / Utility / Head Expense",
    group: "Expense",
    roles: ["admin", "super-admin"],
    fields: [
      "expenseCategory", "expenseSubType", "vendor", "amount", "date", "branch",
      "method", "paymentId", "routing", "externalParty", "remarks", "receipts",
    ],
    required: ["expenseCategory", "expenseSubType", "amount", "branch", "method"],
    // purpose/payeeKind are DERIVED at submit time from `expenseCategory` via
    // derive.js's purposeForCategory()/PAYABLE_CATEGORY_TO_FIXED_KIND — not fixed here,
    // because this one registry entry covers every payable-raising head category
    // (Rent, Electricity Bill, Collab Clinic Payment, Medical Consumables, Medicine
    // Procurement, Professional Expenses, Lab Expenses, Interest Expenses, Taxes,
    // Hardware/Software Rental Expenses) — mirroring getPayableContext.js's "rent"
    // section, which is itself one flow for all of these.
    payable: { periodic: null, allowRaise: true, allowSettle: true },
    endpoint: "/api/transactions/expense/create",
    buildPayload: "expense.head",
    sideEffects: ["transaction", "payableLink", "auditTrail"],
  },

  "expense.vendor": {
    label: "Vendor / Direct Expense",
    group: "Expense",
    roles: ["admin", "super-admin", "sales", "reception", "collab", "stock"],
    fields: [
      "expenseCategory", "expenseSubType", "vendor", "manualPayeeName", "amount",
      "includeGST", "gstRate", "gstAmount",
      "date", "branch", "method", "paymentId", "routing", "externalParty", "remarks", "receipts",
    ],
    required: ["expenseCategory", "amount", "branch", "method"],
    endpoint: "/api/transactions/expense/create",
    buildPayload: "expense.vendor",
    sideEffects: ["transaction", "auditTrail", "vendorLastTransactionPointer"],
  },

  "payable.raise": {
    label: "Raise Payable (Voucher)",
    group: "Payable",
    roles: ["admin", "super-admin"],
    fields: [
      "payeeMode", "payee", "purpose", "expenseCategory", "expenseSubType", "period",
      "relatedPatient", "amount", "dueDate", "branch", "remarks", "receipts",
      "includeGST", "gstRate", "gstAmount", "includeTDS", "tdsCategory", "tdsRate", "tdsAmount",
    ],
    required: ["payee", "purpose", "amount"],
    endpoint: "/api/payables/create",
    buildPayload: "payableRaise",
    sideEffects: ["payableDocument", "auditTrail", "optionalTdsSplitPayable"],
  },

  "payable.settle": {
    label: "Pay Against a Payable",
    group: "Payable",
    roles: ["admin", "super-admin"],
    fields: ["payableId", "amount", "date", "branch", "method", "paymentId", "routing", "externalParty", "remarks", "receipts", "allowOverpayment"],
    required: ["payableId", "amount", "branch", "method"],
    // Deliberately dispatches to the SAME core function as expense.* — "paying a payable"
    // IS expense/create with payableId set, today. A separate settlePayable core module
    // would just re-duplicate that logic; see entryCore/index.js's dispatch table.
    endpoint: "/api/transactions/expense/create",
    buildPayload: "payableSettle",
    sideEffects: ["transaction", "payableOverpaymentGuard", "isSettlementFlag"],
  },

  "receivable.raise": {
    label: "Raise Receivable (Voucher)",
    group: "Receivable",
    roles: ["admin", "super-admin"],
    fields: [
      "payerMode", "payer", "purpose", "revenueCategory", "period",
      "relatedPatient", "amount", "dueDate", "branch", "remarks", "receipts",
    ],
    required: ["payer", "purpose", "amount"],
    endpoint: "/api/receivables/create",
    buildPayload: "receivableRaise",
    sideEffects: ["receivableDocument", "auditTrail"],
  },

  "receivable.settle": {
    label: "Receipt Against a Receivable",
    group: "Receivable",
    roles: ["admin", "super-admin"],
    fields: ["receivableId", "amount", "date", "method", "paymentId", "routing", "externalParty", "remarks", "receipts", "branch", "allowOverpayment"],
    required: ["receivableId", "amount", "method"],
    endpoint: "/api/receivables/[id]/receipt",
    buildPayload: "receivableSettle",
    sideEffects: ["transaction", "receivableOverpaymentGuard", "isSettlementFlag"],
  },

  "advance.out": {
    label: "Give an Advance",
    group: "Financing",
    roles: ["admin", "super-admin"],
    fields: ["party", "subType", "account", "amount", "date", "branch", "reference", "remarks", "receipts"],
    required: ["party", "subType", "account", "amount"],
    endpoint: "/api/advances/create",
    buildPayload: "advance",
    direction: "OUT",
    sideEffects: ["advanceDocument", "receivableRaiseOrTopUp", "auditTrail"],
  },

  "advance.in": {
    label: "Record Advance Recovery",
    group: "Financing",
    roles: ["admin", "super-admin"],
    fields: ["receivableId", "account", "amount", "date", "branch", "reference", "remarks", "receipts", "allowOverRecovery"],
    required: ["receivableId", "account", "amount"],
    endpoint: "/api/advances/create",
    buildPayload: "advance",
    direction: "IN",
    sideEffects: ["advanceDocument", "overRecoveryGuard", "auditTrail"],
  },

  "borrowing.in": {
    label: "Take a Loan",
    group: "Financing",
    roles: ["admin", "super-admin"],
    fields: ["party", "subType", "account", "amount", "date", "branch", "reference", "remarks", "receipts"],
    required: ["party", "subType", "account", "amount"],
    endpoint: "/api/borrowings/create",
    buildPayload: "borrowing",
    direction: "IN",
    sideEffects: ["borrowingDocument", "payableRaiseOrTopUp", "auditTrail"],
  },

  "borrowing.out": {
    label: "Repay a Loan",
    group: "Financing",
    roles: ["admin", "super-admin"],
    fields: ["payableId", "account", "amount", "date", "branch", "reference", "remarks", "receipts", "allowOverpayment"],
    required: ["payableId", "account", "amount"],
    endpoint: "/api/borrowings/create",
    buildPayload: "borrowing",
    direction: "OUT",
    sideEffects: ["borrowingDocument", "overpaymentGuard", "auditTrail"],
  },

  contra: {
    label: "Contra Entry",
    group: "Other",
    roles: ["admin", "super-admin"],
    fields: ["fromAccount", "toAccount", "amount", "date", "branch", "reference", "remarks", "receipts"],
    required: ["fromAccount", "toAccount", "amount"],
    endpoint: "/api/account-transfers/create",
    buildPayload: "contra",
    sideEffects: ["accountTransferDocument", "auditTrail", "postSaveBalanceWarning"],
  },

  suspense: {
    label: "Suspense Entry",
    group: "Other",
    roles: ["admin", "super-admin"],
    fields: ["account", "direction", "amount", "date", "branch", "reference", "remarks", "receipts"],
    required: ["account", "amount"],
    endpoint: "/api/suspense",
    buildPayload: "suspense",
    sideEffects: ["suspenseDocument", "auditTrail"],
  },

  incentive: {
    label: "Patient-Linked Incentive",
    group: "Other",
    roles: ["admin", "super-admin", "sales", "reception", "collab", "stock", "counsellor"],
    fields: ["relatedPatient", "employee", "incentivePurpose", "amount", "date", "branch", "remarks"],
    required: ["relatedPatient", "employee", "incentivePurpose", "amount"],
    endpoint: "/api/incentives",
    buildPayload: "incentive",
    sideEffects: ["patientIncentiveRow", "payableRaiseOrTopUp", "payableRecompute"],
  },

  "collab.case": {
    label: "Collab Case",
    group: "Other",
    roles: ["admin", "super-admin", "collab"],
    fields: [
      "relatedPatient", "clinic", "procedure", "clinicShare", "discount",
      "ourReceived", "clinicReceived", "method", "paymentId", "routing", "date", "remarks",
    ],
    required: ["relatedPatient", "clinic", "procedure", "clinicShare"],
    endpoint: "/api/collab-settlement/cases/create",
    buildPayload: "collabCase",
    sideEffects: ["collabCaseDocument", "clinicSharePayableAndReceivable"],
  },

  "collab.settlement": {
    label: "Collab Settlement",
    group: "Other",
    roles: ["admin", "super-admin"],
    fields: ["clinic", "direction", "amount", "date", "mode", "furtherMode", "receiptMode", "reference", "allocations", "remarks"],
    required: ["clinic", "direction", "amount", "mode"],
    endpoint: "/api/collab-settlement/settlements/create",
    buildPayload: "collabSettlement",
    // AUDIT.md B3: this legacy route is NOT atomic — a mid-loop failure leaves a saved
    // settlement with a partial set of generated transactions and still reports success.
    // Preserved as-is; not fixed here (see AUDIT.md and the Phase B response for the
    // separate-decision flag).
    sideEffects: ["collabSettlementDocument", "perCaseTransactionsBestEffort"],
  },
};

export function entryTypesForRole(role) {
  return Object.entries(ENTRY_TYPES)
    .filter(([, def]) => def.roles.includes(role))
    .map(([key]) => key);
}

export function getEntryType(typeKey) {
  return ENTRY_TYPES[typeKey] || null;
}
