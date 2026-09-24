import mongoose from "mongoose";
import { masterDataEnum } from "@/lib/masterData/validator";
import { ALL_BRANCHES } from "@/lib/branches";

const receiptSchema = new mongoose.Schema(
  {
    url: String,
    publicId: String,
    fileName: String,
    fileType: String,
  },
  { _id: false },
);

const accountTransferSchema = new mongoose.Schema(
  {
    fromAccount: {
      type: String,
      required: true,
      index: true,
      ...masterDataEnum("ACCOUNT", "fromAccount"),
    },
    toAccount: {
      type: String,
      required: true,
      index: true,
      ...masterDataEnum("ACCOUNT", "toAccount"),
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now, index: true },

    branch: {
      type: String,
      enum: ALL_BRANCHES,
      required: true,
      index: true,
    },
    reference: String,
    remarks: String,
    receipts: [receiptSchema],

    sourceTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transactions",
      default: null,
      index: true,
    },

    transferKind: {
      type: String,
      enum: ["MANUAL", "LOAN_SETTLEMENT", "LOAN_CANCELLATION"],
      default: "MANUAL",
      index: true,
    },
    reversesTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountTransfer",
      default: null,
    },
    createdBy: {
      name: String,
      email: String,
      branch: String,
      date: { type: Date, default: Date.now },
    },
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
    isCancelled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

accountTransferSchema.pre("validate", function () {
  if (this.fromAccount && this.toAccount && this.fromAccount === this.toAccount) {
    throw new Error("A contra entry must move money between two different accounts.");
  }
  if (!(this.amount > 0)) {
    throw new Error("Contra entry amount must be greater than zero.");
  }
});

accountTransferSchema.index({ isCancelled: 1, fromAccount: 1, date: 1 });
accountTransferSchema.index({ isCancelled: 1, toAccount: 1, date: 1 });

export default mongoose.models.AccountTransfer ||
  mongoose.model("AccountTransfer", accountTransferSchema);
