import mongoose from "mongoose";

// The lookup lists this accounting CRM used to hard-code — expense heads and their sub-types,
// payment methods, receipt modes, accounts (`furtherMode`) — now live in this one collection,
// discriminated by `kind`. One collection means one cache (src/lib/masterData/index.js) and
// one admin page.
//
// Why these can't stay as Mongoose `enum`s: a schema is built once at import time, but the
// list now changes at runtime. Validation therefore moved to a runtime validator factory
// (src/lib/masterData/validator.js) that checks a value against the active master list OR
// accepts it if the document already holds it — a grandfathered value stays valid on the
// document that has it but can't be chosen for a new one.

export const MASTER_DATA_KINDS = [
  "EXPENSE_CATEGORY",
  "EXPENSE_SUBTYPE",
  "PAYMENT_METHOD",
  "RECEIPT_MODE",
  "ACCOUNT",
];

const masterDataSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      required: true,
      index: true,
      enum: MASTER_DATA_KINDS,
    },

    // The stored value — e.g. "hdfc_skin_bank_transfer". Immutable after creation: changing it
    // would orphan every document holding it. Renames edit `label` only.
    value: { type: String, required: true },
    // What the UI shows — e.g. "HDFC Skin Bank Transfer".
    label: { type: String, required: true },
    // EXPENSE_SUBTYPE -> its category's `value`. null for every other kind.
    parent: { type: String, default: null, index: true },

    // EXPENSE_CATEGORY only. Drives the old DIRECT_PAYMENT_CATEGORIES vs
    // PAYABLE_EXPENSE_CATEGORIES split.
    settlementType: {
      type: String,
      enum: ["DIRECT", "PAYABLE", null],
      default: null,
    },
    // EXPENSE_CATEGORY only. Mirrors the old PAYABLE_CATEGORIES_OWNED_ELSEWHERE (Salary /
    // Incentive / Commision) — payable-backed but raised by their own flow, so hidden from the
    // generic payable dropdown.
    ownedElsewhere: { type: Boolean, default: false },
    // EXPENSE_CATEGORY only. Maps to Payable.purpose for categories that raise payables.
    payablePurpose: { type: String, default: null },

    // PAYMENT_METHOD only — behavioural flags, not labels.
    //  isNonCash   -> excluded from account balances (the money never moved).
    //  isUnsettled -> excluded from P&L *and* balances (someone else holds it) and it raises a
    //                 linked Payable/Receivable.
    // Editing either retroactively changes the accounting treatment of every existing
    // transaction on that method with no reversal trail, so the admin API gates the change
    // behind a live impact preview and writes a MasterDataAudit record.
    isNonCash: { type: Boolean, default: false },
    isUnsettled: { type: Boolean, default: false },
    appliesTo: {
      type: String,
      enum: ["REVENUE", "EXPENSE", "BOTH"],
      default: "BOTH",
    },

    // System rows are depended on by name in code — externalPartyDerivation.js branches on
    // "paid_to_external" / "paid_by_other", collabDerivation.js on "paid_to_external" and
    // "offset_settlement". Only `label` and `sortOrder` may change; never deletable, never
    // removable from the unsettled / non-cash sets.
    isSystem: { type: Boolean, default: false },
    // Retire, never delete: isActive:false drops the value from every picker but keeps it
    // valid on the documents that already hold it and keeps its label rendering in reports.
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    createdBy: {
      name: String,
      email: String,
      branch: String,
      date: { type: Date, default: Date.now },
    },

    // Same shape as Payable.log — the action set differs because a master-data row has a
    // rename / retire / reclassify / flag-toggle lifecycle rather than an amount / due-date one.
    log: [
      {
        action: {
          type: String,
          enum: [
            "Created",
            "Label Changed",
            "Sort Changed",
            "Classification Changed",
            "Purpose Changed",
            "Flag Changed",
            "Retired",
            "Restored",
            "Hard Deleted",
            "Note Added",
          ],
        },
        previousValue: String,
        newValue: String,
        note: String,
        performedBy: { name: String, email: String },
        performedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// Uniqueness is per (kind, parent, value), not (kind, value): the existing data has one
// sub-type name — "Loan Repayment" — under two categories ("Loans" and "Drawings"), and the
// stored value in Transactions.expenseType is the bare string, so both rows must be seedable.
// `parent` is null for every non-sub-type kind, so this still enforces one row per value for
// EXPENSE_CATEGORY / PAYMENT_METHOD / RECEIPT_MODE / ACCOUNT.
masterDataSchema.index({ kind: 1, parent: 1, value: 1 }, { unique: true });
masterDataSchema.index({ kind: 1, isActive: 1, sortOrder: 1 });
masterDataSchema.index({ kind: 1, parent: 1, isActive: 1 });

export default mongoose.models.MasterData ||
  mongoose.model("MasterData", masterDataSchema);
