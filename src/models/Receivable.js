import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";
import { fireSheetWebhook } from "@/lib/sheetsWebhook";

const RECEIVABLE_KINDS = ["PATIENT", "COLLAB_CLINIC", "VENDOR", "EMPLOYEE", "OTHER"];

const RECEIVABLE_PURPOSES = [
  "PATIENT_DUE",
  "COLLAB_SETTLEMENT",
  "REFUND_DUE",
  "ADVANCE_RECOVERY",
  "OTHER",
];

const receivableSchema = new mongoose.Schema(
  {
    payer: {
      kind: { type: String, enum: RECEIVABLE_KINDS, required: true },
      refId: { type: mongoose.Schema.Types.ObjectId },
      label: { type: String, required: true },
    },
    purpose: { type: String, enum: RECEIVABLE_PURPOSES, required: true },

    revenueCategory: String,
    revenueSubType: String,

    period: {
      month: Number,
      year: Number,
    },
    relatedPatient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },

    totalAmount: { type: Number, required: true, min: 0 },
    dueDate: Date,
    branch: { type: String, enum: ALL_BRANCHES, required: true },
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

    allocationFence: { type: Number, default: 0 },

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
  },
  { timestamps: true },
);

receivableSchema.index({ "payer.kind": 1, "payer.refId": 1 });
receivableSchema.index({ purpose: 1, "period.year": 1, "period.month": 1 });
receivableSchema.index({ branch: 1, isCancelled: 1 });
receivableSchema.index({ dueDate: 1 });

// Google Sheets finance webhook — fires once per newly-created receivable, never on edits.
receivableSchema.pre("save", function (next) {
  this.$locals.wasNew = this.isNew;
  next();
});
receivableSchema.post("save", function (doc) {
  if (doc.$locals.wasNew) fireSheetWebhook("Receivable", doc);
});

export const RECEIVABLE_KIND_VALUES = RECEIVABLE_KINDS;
export const RECEIVABLE_PURPOSE_VALUES = RECEIVABLE_PURPOSES;

export default mongoose.models.Receivable || mongoose.model("Receivable", receivableSchema);
