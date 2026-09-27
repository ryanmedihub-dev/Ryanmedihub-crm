import mongoose from "mongoose";

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

    
    field: { type: String, required: true },
    previousValue: { type: String, default: "" },
    newValue: { type: String, default: "" },

    
    affectedCount: { type: Number, default: 0 },
    
    
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
