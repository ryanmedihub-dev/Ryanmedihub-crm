

export const FIELD_SCHEMA = {
  patient: { kind: "patientRef", default: "" },
  walkIn: { kind: "boolean", default: false, sub: { patientName: "", patientPhone: "" } },
  relatedPatient: { kind: "patientRef", default: "" },
  procedure: { kind: "string", default: "" },
  paymentType: { kind: "string", default: "Booking" },
  lineItems: { kind: "lineItems", default: [] },
  discount: { kind: "number", default: 0 },
  amount: { kind: "number", default: "" },

  employee: { kind: "employeeRef", default: "" },
  period: { kind: "period", default: null }, 
  incentiveType: { kind: "string", default: "" },
  incentivePurpose: { kind: "string", default: "" },
  commissionReceiver: { kind: "giver", default: null }, 
  commissionType: { kind: "string", default: "" },

  expenseCategory: { kind: "string", default: "" },
  expenseSubType: { kind: "string", default: "" },
  vendor: { kind: "vendorRef", default: "" },
  manualPayeeName: { kind: "string", default: "" },
  includeGST: { kind: "boolean", default: false },
  gstRate: { kind: "number", default: "" },
  gstAmount: { kind: "number", default: "" },
  includeTDS: { kind: "boolean", default: false },
  tdsCategory: { kind: "string", default: "" },
  tdsRate: { kind: "number", default: "" },
  tdsAmount: { kind: "number", default: "" },

  payeeMode: { kind: "string", default: "VENDOR" }, 
  payee: { kind: "giver", default: null },
  payerMode: { kind: "string", default: "VENDOR" },
  payer: { kind: "giver", default: null },
  purpose: { kind: "string", default: "" },
  revenueCategory: { kind: "string", default: "" },
  dueDate: { kind: "date", default: "" },

  payableId: { kind: "documentRef", default: "" },
  receivableId: { kind: "documentRef", default: "" },
  allowOverpayment: { kind: "boolean", default: false },
  allowOverRecovery: { kind: "boolean", default: false },

  party: { kind: "giver", default: null },
  subType: { kind: "string", default: "" },
  account: { kind: "string", default: "" },
  fromAccount: { kind: "string", default: "" },
  toAccount: { kind: "string", default: "" },
  direction: { kind: "string", default: "IN" },
  reference: { kind: "string", default: "" },

  clinic: { kind: "string", default: "" },
  clinicShare: { kind: "number", default: "" },
  ourReceived: { kind: "number", default: 0 },
  clinicReceived: { kind: "number", default: 0 },
  mode: { kind: "string", default: "" },
  allocations: { kind: "collabAllocations", default: [] },

  method: { kind: "method", default: "cash" },
  paymentId: { kind: "string", default: "" },
  routing: { kind: "routing", default: null }, 
  externalParty: { kind: "externalParty", default: {} },
  receivableAllocationChoice: { kind: "receivableAllocationChoice", default: { mode: "auto" } },

  branch: { kind: "branch", default: "" },
  date: { kind: "date", default: "" },
  remarks: { kind: "string", default: "" },
  receipts: { kind: "receipts", default: [] },
};

export function emptyDraft(fieldKeys, overrides = {}) {
  const draft = {};
  for (const key of fieldKeys) {
    const desc = FIELD_SCHEMA[key];
    if (!desc) continue;
    draft[key] = desc.default;
    if (desc.sub) Object.assign(draft, desc.sub);
  }
  return { ...draft, ...overrides };
}

export function fieldDescriptor(key) {
  return FIELD_SCHEMA[key] || null;
}
