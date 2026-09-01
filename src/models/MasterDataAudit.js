import mongoose from "mongoose";

// One record per change to a behavioural flag on a payment method (isNonCash / isUnsettled),
// and per settlementType reclassification — the mutations that retroactively change how
// existing documents are treated in P&L and balances, with no reversal entry. The audit row
// is the only record that the treatment changed: who, when, old value, new value, and the
// blast radius (how many live documents carried the value at the time).

const masterDataAuditSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, index: true },
    value: { type: String, required: true, index: true },
    masterDataId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MasterData",
      default: null,
      index: true,
    },

    // e.g. "isNonCash", "isUnsettled", "settlementType", "isActive", "label".
    field: { type: String, required: true },
    previousValue: { type: String, default: "" },
    newValue: { type: String, default: "" },

    // Live documents carrying this value when the change was made.
    affectedCount: { type: Number, default: 0 },
    // Free-form snapshot of the impact preview the admin saw before confirming
    // (P&L delta, balance delta, per-collection counts).
    impact: { type: mongoose.Schema.Types.Mixed, default: null },

    performedBy: {
      name: String,
      email: String,
      role: String,
    },
  },
  { timestamps: true },
);

masterDataAuditSchema.index({ createdAt: -1 });
masterDataAuditSchema.index({ kind: 1, value: 1, createdAt: -1 });

export default mongoose.models.MasterDataAudit ||
  mongoose.model("MasterDataAudit", masterDataAuditSchema);
