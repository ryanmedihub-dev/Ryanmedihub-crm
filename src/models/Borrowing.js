import mongoose from "mongoose";
import { masterDataEnum } from "@/lib/masterData/validator";
import { ALL_BRANCHES } from "@/lib/branches";

const receiptSchema = new mongoose.Schema(
  { url: String, publicId: String, fileName: String, fileType: String },
  { _id: false },
);

const PARTY_KINDS = ["VENDOR", "EMPLOYEE", "PATIENT", "OTHER"];

const borrowingSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ["IN", "OUT"], required: true, index: true },

    account: {
      type: String,
      required: true,
      index: true,
      ...masterDataEnum("ACCOUNT", "account"),
    },

    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now, index: true },

    party: {
      kind: { type: String, enum: PARTY_KINDS, required: true },
      refId: { type: mongoose.Schema.Types.ObjectId, default: null },
      label: { type: String, required: true },
    },

    payableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payable",
      required: true,
      index: true,
    },

    settlesReceivableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receivable",
      default: null,
      index: true,
    },

    branch: { type: String, enum: ALL_BRANCHES, required: true, index: true },

    reference: String,
    remarks: String,
    receipts: [receiptSchema],

    isCancelled: { type: Boolean, default: false },

    log: [
      {
        action: {
          type: String,
          enum: ["Created", "Amount Revised", "Cancelled", "Note Added"],
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

borrowingSchema.pre("validate", function () {
  if (!(this.amount > 0)) {
    throw new Error("Borrowing amount must be greater than zero.");
  }
});

borrowingSchema.index({ isCancelled: 1, account: 1, date: 1 });
borrowingSchema.index({ isCancelled: 1, payableId: 1, direction: 1 });

borrowingSchema.index(
  { settlesReceivableId: 1, isCancelled: 1, direction: 1 },
  { partialFilterExpression: { settlesReceivableId: { $type: "objectId" } } },
);

export const BORROWING_PARTY_KINDS = PARTY_KINDS;

export default mongoose.models.Borrowing || mongoose.model("Borrowing", borrowingSchema);
