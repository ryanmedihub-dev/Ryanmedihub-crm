import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

const PAYABLE_KINDS = [
  "EMPLOYEE",
  "RENT_UNIT",
  "UTILITY_UNIT",
  "COLLAB_CLINIC",
  "PATIENT",
  "VENDOR",
  "OTHER",
];

const PAYABLE_PURPOSES = [
  "SALARY",
  "INCENTIVE",
  "RENT",
  "ELECTRICITY",
  "COLLAB_CLINIC",
  "PATIENT_COMMISSION",
  "TAX",
  "MEDICAL_CONSUMABLES",
  "MEDICINE_PROCUREMENT",
  "PROFESSIONAL_EXPENSES",
  "LAB_EXPENSES",
  "INTEREST_EXPENSES",
  "SOFTWARE_RENTAL",
  "HARDWARE_RENTAL",
  "OTHER",
];

const MONTHLY_PURPOSES = ["SALARY", "RENT", "ELECTRICITY", "COLLAB_CLINIC", "TAX"];

const payableSchema = new mongoose.Schema(
  {
    payee: {
      kind: { type: String, enum: PAYABLE_KINDS, required: true },
      refId: { type: mongoose.Schema.Types.ObjectId },
      label: { type: String, required: true },
    },
    purpose: { type: String, enum: PAYABLE_PURPOSES, required: true },

    expenseCategory: String,
    expenseSubType: String,

    period: {
      month: Number,
      year: Number,
    },
    relatedPatient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },

    totalAmount: { type: Number, required: true, min: 0 },
    dueDate: Date,
    branch: { type: String, enum: ALL_BRANCHES },
    remarks: String,
    isCancelled: { type: Boolean, default: false },

    receipts: [
      {
        url: String,
        publicId: String,
        fileName: String,
        fileType: { type: String, enum: ["image", "pdf"] },
        uploadedBy: { name: String, email: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    costAlreadyRecognised: { type: Boolean, default: false, index: true },

    excludeFromPnl: { type: Boolean, default: false, index: true },

    log: [
      {
        action: {
          type: String,
          enum: ["Created", "Amount Revised", "Due Date Changed", "Cancelled", "Note Added"],
        },
        previousValue: String,
        newValue: String,
        note: String,
        performedBy: { name: String, email: String },
        performedAt: { type: Date, default: Date.now },
      },
    ],

    createdBy: {
      name: String,
      email: String,
      branch: String,
      date: { type: Date, default: Date.now },
    },

    tdsLink: {
      role: { type: String, enum: ["PARENT", "TDS"], default: null },
      linkedId: { type: mongoose.Schema.Types.ObjectId, ref: "Payable", default: null },
      grossAmount: Number,
      tdsRate: Number,
      tdsAmount: Number,
    },

    // Set when this payable was created by an /admin/uploads bulk run — lets that batch's
    // revert find exactly the documents it made. Null for every normal single-entry payable.
    uploadBatch: { type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch", default: null, index: true },
  },
  { timestamps: true },
);

payableSchema.index({ "payee.kind": 1, "payee.refId": 1 });
// Backs buildCompensationMetrics (Owner Employees pages): EMPLOYEE payables for a set of
// employees over a pay-month window, split by purpose.
payableSchema.index({ "payee.kind": 1, "payee.refId": 1, purpose: 1, "period.year": 1, "period.month": 1, isCancelled: 1 });
payableSchema.index({ purpose: 1, "period.year": 1, "period.month": 1 });
payableSchema.index({ branch: 1, isCancelled: 1 });
payableSchema.index({ dueDate: 1 });
// Serves the /admin/liabilities/payables/{rent,employees,other} split — the first $match on
// every grouped/list pipeline is `{ isCancelled, purpose: {$in}, branch }` ordered by dueDate.
payableSchema.index({ isCancelled: 1, purpose: 1, branch: 1, dueDate: -1 });

// Monthly payables are NOT uniqueness-constrained at the DB level — the same payee can hold
// as many payables for a purpose/month as the business actually has (different heads,
// re-issued invoices, corrections, re-uploads after a cancellation). Accidental double-entry
// is surfaced as a non-blocking warning by the bulk-upload validator instead. This index is
// kept only to serve queries/aggregations keyed by payee + purpose + period.
// NOTE: earlier versions made this `unique: true`. Drop the stale unique index once per
// environment with `node scripts/drop-payable-monthly-unique-index.mjs`.
payableSchema.index({
  "payee.kind": 1,
  "payee.refId": 1,
  "payee.label": 1,
  purpose: 1,
  expenseSubType: 1,
  "period.month": 1,
  "period.year": 1,
});

export const PAYABLE_KIND_VALUES = PAYABLE_KINDS;
export const PAYABLE_PURPOSE_VALUES = PAYABLE_PURPOSES;
export const MONTHLY_PAYABLE_PURPOSES = MONTHLY_PURPOSES;

export default mongoose.models.Payable || mongoose.model("Payable", payableSchema);
