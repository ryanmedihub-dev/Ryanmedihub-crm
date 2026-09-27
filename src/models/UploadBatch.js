import mongoose from "mongoose";

const uploadBatchSchema = new mongoose.Schema(
  {
    batchNo: { type: Number, index: true }, 
    kind: { type: String, enum: ["PAYABLE", "CAMPAIGN_LEAD"], default: "PAYABLE" },
    label: String, 
    fileName: String,
    totalRows: Number,

    createdPayables: [{ type: mongoose.Schema.Types.ObjectId, ref: "Payable" }],
    createdCampaignLeads: [{ type: mongoose.Schema.Types.ObjectId, ref: "CampaignLead" }],
    failedRows: [{ rowNumber: Number, error: String }],
    rowHashes: [String],

    status: {
      type: String,
      enum: ["processing", "completed", "partial", "failed", "reverted"],
      default: "processing",
      index: true,
    },

    createdBy: {
      name: String,
      email: String,
      branch: String,
      date: { type: Date, default: Date.now },
    },
    revertedAt: Date,
    revertedBy: { name: String, email: String },

    
    sourceSync: {
      status:      { type: String, enum: ["pending", "done", "partial", "failed", "skipped"], default: undefined },
      label:       String,
      matched:     { type: Number, default: 0 },
      updated:     { type: Number, default: 0 },
      alreadySet:  { type: Number, default: 0 },
      unmatched:   { type: Number, default: 0 },
      error:       String,
      syncedAt:    Date,
    },
  },
  { timestamps: true },
);

export default mongoose.models.UploadBatch || mongoose.model("UploadBatch", uploadBatchSchema);
