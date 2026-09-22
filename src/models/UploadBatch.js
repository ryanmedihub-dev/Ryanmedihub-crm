import mongoose from "mongoose";

// One bulk-upload run from /admin/uploads. A batch is the unit of "undo" — revert cancels
// every payable it created (that has no payment against it). See §3.3 / §3.6 of the feature spec.
const uploadBatchSchema = new mongoose.Schema(
  {
    batchNo: { type: Number, index: true }, // human-friendly running number
    kind: { type: String, enum: ["PAYABLE", "CAMPAIGN_LEAD"], default: "PAYABLE" },
    label: String, // user-typed, e.g. "Sept 2026 salaries"
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

    // CAMPAIGN_LEAD batches only: result of pushing the campaign label onto callby Lead.source.
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
