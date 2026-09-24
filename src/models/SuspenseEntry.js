import mongoose from "mongoose";
import { masterDataEnum } from "@/lib/masterData/validator";
import { ALL_BRANCHES } from "@/lib/branches";

const receiptSchema = new mongoose.Schema(
  { url: String, publicId: String, fileName: String, fileType: String },
  { _id: false },
);

const suspenseEntrySchema = new mongoose.Schema(
  {
    account: {
      type: String,
      required: true,
      index: true,
      ...masterDataEnum("ACCOUNT", "account"),
    },

    direction: { type: String, enum: ["IN", "OUT"], default: "IN", required: true },

    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now, index: true },

    branch: { type: String, enum: ALL_BRANCHES, required: true, index: true },

    reference: String,
    remarks: String,
    receipts: [receiptSchema],

    isResolved: { type: Boolean, default: false, index: true },
    resolvedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transactions",
      default: null,
    },
    resolvedAt: Date,
    resolvedBy: { name: String, email: String },

    isCancelled: { type: Boolean, default: false },

    log: [
      {
        action: {
          type: String,
          enum: ["Created", "Amount Revised", "Resolved", "Reopened", "Cancelled", "Note Added"],
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

suspenseEntrySchema.pre("validate", function () {
  if (!(this.amount > 0)) {
    throw new Error("Suspense amount must be greater than zero.");
  }
  if (this.isResolved && !this.resolvedTransactionId) {
    throw new Error(
      "A resolved suspense entry must link the transaction that explains it — otherwise the money leaves the balance with nothing taking its place.",
    );
  }
});

suspenseEntrySchema.index({ isResolved: 1, isCancelled: 1, account: 1, date: 1 });
suspenseEntrySchema.index({ isResolved: 1, date: -1 });

export default mongoose.models.SuspenseEntry ||
  mongoose.model("SuspenseEntry", suspenseEntrySchema);
