import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

// BANK_ROUTING_MAP was a branch x transactionCategory x method matrix hard-coded in
// src/constants/bankRouting.js — this is one row per cell of that matrix.
// getBankRoutingDefaults() reads this collection; a missing row means a blank pre-fill, which
// is the intended behaviour for the collab branches (they deliberately have no rules).

const bankRoutingRuleSchema = new mongoose.Schema(
  {
    branch: { type: String, enum: ALL_BRANCHES, required: true },
    // Revenue-side only — matches the categories getBankRoutingDefaults() is ever called with.
    transactionCategory: {
      type: String,
      enum: ["TRANSPLANT", "SERVICE", "MEDICINE"],
      required: true,
    },
    // Left a free string on purpose: this is the revenue receipt vocabulary
    // (cash / card / upi / bajaj_loan / fibe_loan), a different set from Transactions.method,
    // and it is validated against the PAYMENT_METHOD master list at the admin API, not here.
    method: { type: String, required: true },

    receiptMode: { type: String, default: "" },
    furtherMode: { type: String, default: "" },

    // Retire, never delete — mirrors MasterData. A retired rule falls back to a blank pre-fill.
    isActive: { type: Boolean, default: true },

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
          enum: ["Created", "Updated", "Retired", "Restored", "Note Added"],
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

// One rule per branch x category x method — getBankRoutingDefaults() looks up exactly this key.
bankRoutingRuleSchema.index(
  { branch: 1, transactionCategory: 1, method: 1 },
  { unique: true },
);
bankRoutingRuleSchema.index({ branch: 1, transactionCategory: 1, isActive: 1 });

export default mongoose.models.BankRoutingRule ||
  mongoose.model("BankRoutingRule", bankRoutingRuleSchema);
