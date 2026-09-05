import mongoose from "mongoose";
import { masterDataEnum } from "@/lib/masterData/validator";
import { ALL_BRANCHES } from "@/lib/branches";

const receiptSchema = new mongoose.Schema(
  { url: String, publicId: String, fileName: String, fileType: String },
  { _id: false },
);

const PARTY_KINDS = ["EMPLOYEE", "VENDOR", "PATIENT", "OTHER"];

const advanceSchema = new mongoose.Schema(
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

    receivableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receivable",
      required: true,
      index: true,
    },

    // Deprecated single-payable settlement pair — kept only so pre-existing settled
    // advances keep reading correctly. Every settle action now writes to `settlements`
    // below instead (folding one of these into it first if present) — see
    // src/lib/advanceSettlements.js, which every consumer of either shape goes through.
    settlesPayableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payable",
      default: null,
      index: true,
    },

    // How much of this advance is applied to settlesPayableId — a non-cash contra
    // settlement that nets against BOTH the payable's outstanding and this advance's
    // own receivable. null on legacy rows / when unset: treat as the full `amount`.
    settlesPayableAmount: { type: Number, default: null, min: 0 },

    // One advance can now net against several payables (e.g. a 10k advance split 2k/3k/1k/2k
    // across four salary payables) — each line nets against BOTH that payable's outstanding
    // and this advance's own receivable, exactly like settlesPayableAmount did for one.
    settlements: {
      type: [
        new mongoose.Schema(
          {
            payableId: { type: mongoose.Schema.Types.ObjectId, ref: "Payable", required: true },
            amount: { type: Number, required: true, min: 0.01 },
            note: String,
            settledAt: { type: Date, default: Date.now },
            settledBy: { name: String, email: String },
          },
          { _id: true },
        ),
      ],
      default: [],
    },

    branch: { type: String, enum: ALL_BRANCHES, default: null, index: true },

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

advanceSchema.pre("validate", function () {
  if (!(this.amount > 0)) {
    throw new Error("Advance amount must be greater than zero.");
  }
});

advanceSchema.index({ isCancelled: 1, account: 1, date: 1 });
advanceSchema.index({ isCancelled: 1, receivableId: 1, direction: 1 });

// payableAggregation.js's advanceSettlementAgg $lookup joins on settlesPayableId per payable
// document — same O(documents x advances) risk as the Transactions lookups above without this.
// Partial: most advances never settle a payable.
advanceSchema.index(
  { settlesPayableId: 1, isCancelled: 1, direction: 1 },
  { partialFilterExpression: { settlesPayableId: { $type: "objectId" } } },
);

// Same lookup cost for the multi-settlement array's per-line payableId.
advanceSchema.index({ "settlements.payableId": 1, isCancelled: 1, direction: 1 });

export const ADVANCE_PARTY_KINDS = PARTY_KINDS;

export default mongoose.models.Advance || mongoose.model("Advance", advanceSchema);
