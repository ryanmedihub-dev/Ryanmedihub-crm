import mongoose from "mongoose";

const deleteLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["Patient", "Transaction", "Stock", "Receivable", "Payable", "CollabSettlement", "Employee"],
      required: true,
    },
    entityId: {
      type: String,
      required: true,
    },
    entityName: {
      type: String,
    },
    entityDetails: {
      type: mongoose.Schema.Types.Mixed,
    },
    deletedBy: {
      name: String,
      email: String,
      branch: String,
    },
    branch: {
      type: String,
    },
    deletedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

deleteLogSchema.index({ entityType: 1, deletedAt: -1 });
deleteLogSchema.index({ branch: 1, deletedAt: -1 });

export default mongoose.models.DeleteLog ||
  mongoose.model("DeleteLog", deleteLogSchema);
