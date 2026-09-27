import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

const bankRoutingRuleSchema = new mongoose.Schema(
  {
    branch: { type: String, enum: ALL_BRANCHES, required: true },
    
    transactionCategory: {
      type: String,
      enum: ["TRANSPLANT", "SERVICE", "MEDICINE"],
      required: true,
    },
    
    
    
    method: { type: String, required: true },

    receiptMode: { type: String, default: "" },
    furtherMode: { type: String, default: "" },

    
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

bankRoutingRuleSchema.index(
  { branch: 1, transactionCategory: 1, method: 1 },
  { unique: true },
);
bankRoutingRuleSchema.index({ branch: 1, transactionCategory: 1, isActive: 1 });

export default mongoose.models.BankRoutingRule ||
  mongoose.model("BankRoutingRule", bankRoutingRuleSchema);
