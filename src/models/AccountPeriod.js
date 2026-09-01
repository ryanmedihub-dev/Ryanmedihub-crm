import mongoose from "mongoose";
import { masterDataEnum } from "@/lib/masterData/validator";
import { ALL_BRANCHES } from "@/lib/branches";

const accountPeriodSchema = new mongoose.Schema(
  {
    account: {
      type: String,
      required: true,
      index: true,
      ...masterDataEnum("ACCOUNT", "account"),
    },

    branch: {
      type: String,
      enum: ALL_BRANCHES,
      default: null,
      index: true,
    },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    openingBalance: { type: Number, required: true },
    totalIn: { type: Number, required: true },
    totalOut: { type: Number, required: true },
    closingBalance: { type: Number, required: true },
    transactionCount: { type: Number, default: 0 },
    contraCount: { type: Number, default: 0 },

    isClosed: { type: Boolean, default: false },
    closedBy: { name: String, email: String },
    closedAt: Date,
    notes: String,

    log: [
      {
        action: {
          type: String,
          enum: ["Closed", "Reopened", "Recomputed", "Seeded"],
        },
        reason: String,
        previousClosingBalance: Number,
        newClosingBalance: Number,
        performedBy: { name: String, email: String },
        performedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export function isOpeningSeed(period) {
  return (
    !!period &&
    new Date(period.periodStart).getTime() === new Date(period.periodEnd).getTime()
  );
}

accountPeriodSchema.index({ account: 1, branch: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

accountPeriodSchema.index({ account: 1, branch: 1, isClosed: 1, periodEnd: -1 });

export default mongoose.models.AccountPeriod ||
  mongoose.model("AccountPeriod", accountPeriodSchema);
