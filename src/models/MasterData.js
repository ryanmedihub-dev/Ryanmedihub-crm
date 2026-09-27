import mongoose from "mongoose";

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

    
    
    value: { type: String, required: true },
    
    label: { type: String, required: true },
    
    parent: { type: String, default: null, index: true },

    
    
    settlementType: {
      type: String,
      enum: ["DIRECT", "PAYABLE", null],
      default: null,
    },
    
    
    
    ownedElsewhere: { type: Boolean, default: false },
    
    payablePurpose: { type: String, default: null },

    
    
    
    
    
    
    
    isNonCash: { type: Boolean, default: false },
    isUnsettled: { type: Boolean, default: false },
    appliesTo: {
      type: String,
      enum: ["REVENUE", "EXPENSE", "BOTH"],
      default: "BOTH",
    },

    
    
    
    
    isSystem: { type: Boolean, default: false },
    
    
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

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

masterDataSchema.index({ kind: 1, parent: 1, value: 1 }, { unique: true });
masterDataSchema.index({ kind: 1, isActive: 1, sortOrder: 1 });
masterDataSchema.index({ kind: 1, parent: 1, isActive: 1 });

export default mongoose.models.MasterData ||
  mongoose.model("MasterData", masterDataSchema);
